import os
import uuid
import hashlib
import urllib.parse
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Response, Depends, Header, Query, Request
from pydantic import BaseModel
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from backend.core.config import settings
from backend.core.database import get_db_pool
from backend.core.dependencies import get_current_user_session, get_client_ip, require_permission

router = APIRouter(prefix="/api/v1/employees", tags=["Employee Documents"])

# Allowed MIME types per enterprise compliance
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

# Forbidden executable extensions (RCE mitigation)
FORBIDDEN_EXTENSIONS = {".exe", ".sh", ".bat", ".js", ".py", ".cmd", ".vbs", ".ps1", ".jar", ".msi"}

# Maximum 15 MB file size limit
MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024


def get_encryption_cipher() -> AESGCM:
    """Derive 256-bit key from settings.FILE_ENCRYPTION_KEY and return AESGCM cipher."""
    raw_key = os.getenv("FILE_ENCRYPTION_KEY", getattr(settings, "FILE_ENCRYPTION_KEY", "enterprise-master-sec-key-2026-aes256gcm"))
    # Ensure key is exactly 32 bytes (256 bits)
    key_bytes = hashlib.sha256(raw_key.encode("utf-8")).digest()
    return AESGCM(key_bytes)


def encrypt_data(plaintext: bytes) -> bytes:
    """Encrypt binary stream using AES-256-GCM with a 12-byte random IV/nonce."""
    cipher = get_encryption_cipher()
    nonce = os.urandom(12)
    ciphertext = cipher.encrypt(nonce, plaintext, None)
    return nonce + ciphertext


def decrypt_data(encrypted_payload: bytes) -> bytes:
    """Decrypt binary stream using AES-256-GCM extracting the 12-byte nonce."""
    if len(encrypted_payload) < 28:  # 12 bytes nonce + 16 bytes auth tag minimum
        raise ValueError("Encrypted payload is corrupted or too short.")
    cipher = get_encryption_cipher()
    nonce = encrypted_payload[:12]
    ciphertext = encrypted_payload[12:]
    return cipher.decrypt(nonce, ciphertext, None)


async def resolve_audit_author(conn, session: Dict[str, Any]) -> tuple:
    user_id = None
    uid_str = session.get("id") or session.get("user_id")
    if uid_str:
        try:
            parsed_id = uuid.UUID(str(uid_str))
            exists = await conn.fetchval("SELECT id FROM users WHERE id = $1;", parsed_id)
            if exists:
                user_id = parsed_id
        except Exception:
            pass
    author_name = session.get("full_name") or session.get("username") or "Authorized User"
    return user_id, author_name


@router.get("/{employee_id}/documents")
async def list_employee_documents(
    employee_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """List document metadata records for an employee."""
    require_permission(session, "employees.read")
    pool = get_db_pool()
    try:
        emp_uuid = uuid.UUID(employee_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee UUID.")

    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, employee_id, document_type, original_filename, file_size_bytes,
                   mime_type, sha256_checksum, storage_path, is_encrypted, uploaded_by, created_at
            FROM employee_documents
            WHERE employee_id = $1
            ORDER BY created_at DESC;
        """, emp_uuid)

        docs = []
        for r in rows:
            docs.append({
                "id": str(r["id"]),
                "employee_id": str(r["employee_id"]),
                "document_type": r["document_type"],
                "original_filename": r["original_filename"],
                "file_size_bytes": r["file_size_bytes"],
                "mime_type": r["mime_type"],
                "sha256_checksum": r["sha256_checksum"],
                "is_encrypted": r["is_encrypted"],
                "uploaded_by": str(r["uploaded_by"]) if r["uploaded_by"] else None,
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            })
        return {"documents": docs}


@router.post("/{employee_id}/documents")
async def upload_employee_document(
    employee_id: str,
    request: Request,
    file: UploadFile = File(...),
    document_type: str = Form("General"),
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Encrypts uploaded file via AES-256-GCM and persists ciphertext to physical disk.
    Metadata is written to employee_documents table.
    """
    require_permission(session, "employees.update")
    pool = get_db_pool()
    try:
        emp_uuid = uuid.UUID(employee_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee UUID.")

    # 1. Filename & Extension Security Inspection
    filename = file.filename or "uploaded_document"
    _, ext = os.path.splitext(filename.lower())
    if ext in FORBIDDEN_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Security violation: Executable extension '{ext}' is prohibited in the encrypted vault."
        )

    # 2. MIME Type Validation
    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported document format '{content_type}'. Allowed: PDF, JPEG, PNG, DOC, DOCX."
        )

    # 3. Read stream & verify size
    contents = await file.read()
    file_size = len(contents)
    if file_size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of 15 MB (Actual: {file_size / (1024*1024):.2f} MB)."
        )

    if file_size == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # 4. Check employee exists & resolve tenant_id
    async with pool.acquire() as conn:
        emp_record = await conn.fetchrow("""
            SELECT id, organization_id, full_name FROM employees WHERE id = $1;
        """, emp_uuid)
        if not emp_record:
            raise HTTPException(status_code=404, detail="Employee not found.")

        tenant_id = str(emp_record["organization_id"]) if emp_record["organization_id"] else "default_tenant"

        # 5. Encrypt data in memory with AES-256-GCM
        sha256_hash = hashlib.sha256(contents).hexdigest()
        encrypted_payload = encrypt_data(contents)

        # 6. Physical filesystem directory structure
        doc_id = uuid.uuid4()
        storage_dir = os.path.join(
            "storage", "tenants", tenant_id, "employees", str(emp_uuid)
        )
        os.makedirs(storage_dir, exist_ok=True)
        storage_filepath = os.path.join(storage_dir, f"{doc_id}.enc")

        with open(storage_filepath, "wb") as f:
            f.write(encrypted_payload)

        user_id, author_name = await resolve_audit_author(conn, session)
        client_ip = get_client_ip(request) if request else "127.0.0.1"

        # 7. Write metadata to database
        await conn.execute("""
            INSERT INTO employee_documents (
                id, employee_id, document_type, original_filename, file_size_bytes,
                mime_type, sha256_checksum, storage_path, is_encrypted, uploaded_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9);
        """, doc_id, emp_uuid, document_type, filename, file_size, content_type, sha256_hash, storage_filepath, user_id)

        # 8. Record audit log entry
        await conn.execute("""
            INSERT INTO audit_logs (
                id, entity_type, entity_id, action, changed_by_user_id, changed_by_name, note, changes, ip_address
            ) VALUES (
                $1::uuid, 'employees', $2, 'UPDATE', $3, $4,
                $5, $6::jsonb, $7
            );
        """, str(uuid.uuid4()), str(emp_uuid), user_id, author_name,
            f"Uploaded encrypted {document_type} document: '{filename}' ({file_size // 1024} KB).",
            '{"document_upload": {"filename": "' + filename + '", "type": "' + document_type + '"}}',
            client_ip
        )

    return {
        "id": str(doc_id),
        "employee_id": str(emp_uuid),
        "document_type": document_type,
        "original_filename": filename,
        "file_size_bytes": file_size,
        "mime_type": content_type,
        "sha256_checksum": sha256_hash,
        "is_encrypted": True,
        "message": "File encrypted with AES-256-GCM and stored securely."
    }


@router.get("/{employee_id}/documents/{document_id}/download")
async def download_employee_document(
    employee_id: str,
    document_id: str,
    inline: bool = Query(False, description="Whether to view inline in browser instead of attachment download"),
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Retrieves ciphertext from disk, decrypts stream in memory via AES-256-GCM,
    and returns decrypted binary stream with RFC-compliant Content-Disposition headers.
    """
    require_permission(session, "employees.read")
    pool = get_db_pool()
    try:
        emp_uuid = uuid.UUID(employee_id)
        doc_uuid = uuid.UUID(document_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee or document UUID.")

    async with pool.acquire() as conn:
        doc = await conn.fetchrow("""
            SELECT id, employee_id, document_type, original_filename,
                   file_size_bytes, mime_type, storage_path, is_encrypted
            FROM employee_documents
            WHERE id = $1 AND employee_id = $2;
        """, doc_uuid, emp_uuid)

        if not doc:
            raise HTTPException(status_code=404, detail="Document metadata record not found.")

        storage_path = doc["storage_path"]
        if not os.path.exists(storage_path):
            raise HTTPException(status_code=404, detail="Encrypted physical file not found on disk.")

        with open(storage_path, "rb") as f:
            encrypted_bytes = f.read()

        try:
            if doc["is_encrypted"]:
                decrypted_bytes = decrypt_data(encrypted_bytes)
            else:
                decrypted_bytes = encrypted_bytes
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Decryption failed: {str(e)}")

        orig_filename = doc["original_filename"] or "document.pdf"
        # Sanitize ASCII fallback and encode for UTF-8 RFC 5987 / RFC 6266
        safe_ascii = orig_filename.replace('"', '').replace('\n', '').replace('\r', '')
        encoded_filename = urllib.parse.quote(orig_filename)
        disposition_type = "inline" if inline else "attachment"

        headers = {
            "Content-Disposition": f'{disposition_type}; filename="{safe_ascii}"; filename*=UTF-8\'\'{encoded_filename}',
            "X-Vault-Decrypted": "true",
            "X-Content-Type-Options": "nosniff",
            "Access-Control-Expose-Headers": "Content-Disposition",
        }
        return Response(content=decrypted_bytes, media_type=doc["mime_type"], headers=headers)


@router.delete("/{employee_id}/documents/{document_id}")
async def delete_employee_document(
    employee_id: str,
    document_id: str,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Deletes ciphertext from filesystem and removes metadata record from PostgreSQL."""
    require_permission(session, "employees.update")
    pool = get_db_pool()
    try:
        emp_uuid = uuid.UUID(employee_id)
        doc_uuid = uuid.UUID(document_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee or document UUID.")

    async with pool.acquire() as conn:
        doc = await conn.fetchrow("""
            SELECT id, original_filename, storage_path, document_type
            FROM employee_documents
            WHERE id = $1 AND employee_id = $2;
        """, doc_uuid, emp_uuid)

        if not doc:
            raise HTTPException(status_code=404, detail="Document not found.")

        # Delete physical ciphertext file from disk
        storage_path = doc["storage_path"]
        if os.path.exists(storage_path):
            try:
                os.remove(storage_path)
            except Exception as e:
                pass

        await conn.execute("DELETE FROM employee_documents WHERE id = $1;", doc_uuid)

        user_id, author_name = await resolve_audit_author(conn, session)
        client_ip = get_client_ip(request) if request else "127.0.0.1"

        # Log audit entry
        await conn.execute("""
            INSERT INTO audit_logs (
                id, entity_type, entity_id, action, changed_by_user_id, changed_by_name, note, ip_address
            ) VALUES (
                $1::uuid, 'employees', $2, 'UPDATE', $3, $4,
                $5, $6
            );
        """, str(uuid.uuid4()), str(emp_uuid), user_id, author_name,
            f"Purged encrypted {doc['document_type']} document '{doc['original_filename']}' from vault.",
            client_ip
        )

    return {"status": "success", "message": "Document purged from encrypted storage."}
