import uuid
import json
import hashlib
import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from backend.core.sequences import uuid7


class AuditLog(BaseModel):
    """SOX 404 / ISO 27001 Cryptographically Chained Audit Log Model."""
    id: uuid.UUID
    tenant_id: str = "default_tenant"
    entity_type: str
    entity_id: str
    action: str
    changed_by_user_id: Optional[uuid.UUID] = None
    changed_by_name: Optional[str] = None
    changes: Optional[Dict[str, Any]] = None
    note: Optional[str] = None
    ip_address: Optional[str] = None
    prev_hash: Optional[str] = None
    row_hash: Optional[str] = None
    created_at: datetime.datetime


def build_canonical_payload(changes: Any = None, note: Optional[str] = None) -> str:
    """
    Produce a deterministic, canonical JSON string payload for cryptographic hashing.
    Keys are sorted and delimiters are compact (',', ':').
    """
    payload: Dict[str, Any] = {}
    if changes is not None:
        if isinstance(changes, str):
            try:
                payload["changes"] = json.loads(changes)
            except Exception:
                payload["changes"] = changes
        else:
            payload["changes"] = changes
    if note:
        payload["note"] = note.strip()
    return json.dumps(payload, sort_keys=True, separators=(',', ':'), default=str)


def format_canonical_timestamp(dt: datetime.datetime) -> str:
    """Format datetime to canonical UTC ISO-8601 string."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    else:
        dt = dt.astimezone(datetime.timezone.utc)
    return dt.isoformat()


def compute_row_hash(
    tenant_id: str,
    prev_hash: str,
    timestamp_str: str,
    user_id_str: str,
    action: str,
    resource: str,
    canonical_payload: str,
) -> str:
    """
    Compute cryptographic SHA-256 hash for an audit log entry:
    SHA256(tenant_id + prev_hash + timestamp + user_id + action + resource + canonical_json_payload)
    """
    raw_message = (
        f"{tenant_id}"
        f"{prev_hash}"
        f"{timestamp_str}"
        f"{user_id_str}"
        f"{action}"
        f"{resource}"
        f"{canonical_payload}"
    )
    return hashlib.sha256(raw_message.encode("utf-8")).hexdigest()


async def record_audit_log(
    conn,
    entity_type: str,
    entity_id: str,
    action: str,
    tenant_id: str = "default_tenant",
    changed_by_user_id: Optional[uuid.UUID] = None,
    changed_by_name: Optional[str] = None,
    changes: Optional[Dict[str, Any]] = None,
    note: Optional[str] = None,
    ip_address: Optional[str] = None,
    created_at: Optional[datetime.datetime] = None,
) -> Dict[str, Any]:
    """
    Atomically writes a cryptographically linked, append-only entry to audit_logs.
    Fetches the latest row_hash for the specified tenant (or 'GENESIS' if none exists)
    and computes the SHA-256 hash chain link.
    """
    clean_tenant_id = str(tenant_id or "default_tenant").strip()
    clean_action = str(action or "OPERATION").strip().upper()
    clean_resource = f"{entity_type}:{entity_id}"
    user_id_str = str(changed_by_user_id) if changed_by_user_id else "SYSTEM"
    now = created_at or datetime.datetime.now(datetime.timezone.utc)
    timestamp_str = format_canonical_timestamp(now)

    # 1. Fetch latest row_hash for this tenant
    latest_hash = await conn.fetchval("""
        SELECT row_hash FROM audit_logs
        WHERE tenant_id = $1 AND row_hash IS NOT NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1;
    """, clean_tenant_id)

    prev_hash = latest_hash if latest_hash else "GENESIS"

    # 2. Compute canonical payload and SHA-256 row_hash
    canonical_payload = build_canonical_payload(changes=changes, note=note)
    row_hash = compute_row_hash(
        tenant_id=clean_tenant_id,
        prev_hash=prev_hash,
        timestamp_str=timestamp_str,
        user_id_str=user_id_str,
        action=clean_action,
        resource=clean_resource,
        canonical_payload=canonical_payload,
    )

    log_id = uuid7()
    changes_json = json.dumps(changes) if changes is not None else None

    # 3. Insert append-only record
    await conn.execute("""
        INSERT INTO audit_logs (
            id, tenant_id, entity_type, entity_id, action,
            changed_by_user_id, changed_by_name, changes, note,
            ip_address, prev_hash, row_hash, created_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13
        );
    """, log_id, clean_tenant_id, entity_type, str(entity_id), clean_action,
        changed_by_user_id, changed_by_name or "Authorized User", changes_json,
        note, ip_address, prev_hash, row_hash, now)

    return {
        "id": str(log_id),
        "tenant_id": clean_tenant_id,
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "action": clean_action,
        "changed_by_user_id": str(changed_by_user_id) if changed_by_user_id else None,
        "changed_by_name": changed_by_name or "Authorized User",
        "changes": changes,
        "note": note,
        "ip_address": ip_address,
        "prev_hash": prev_hash,
        "row_hash": row_hash,
        "created_at": timestamp_str,
    }


async def verify_audit_chain(conn, tenant_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Recalculates the cryptographic hash chain for one or all tenants in audit_logs.
    Detects any unauthorized modification, deletion, or broken linkage in the ledger.
    """
    if tenant_id:
        tenants = [str(tenant_id).strip()]
    else:
        tenant_rows = await conn.fetch("SELECT DISTINCT tenant_id FROM audit_logs;")
        tenants = [r["tenant_id"] for r in tenant_rows if r["tenant_id"]]
        if not tenants:
            tenants = ["default_tenant"]

    total_records = 0
    all_valid = True
    tenant_reports = []
    tampered_records = []

    for t_id in tenants:
        rows = await conn.fetch("""
            SELECT id, tenant_id, entity_type, entity_id, action,
                   changed_by_user_id, changed_by_name, changes, note,
                   prev_hash, row_hash, created_at
            FROM audit_logs
            WHERE tenant_id = $1
            ORDER BY created_at ASC, id ASC;
        """, t_id)

        t_count = len(rows)
        total_records += t_count
        t_valid = True
        t_errors = []
        expected_prev_hash = "GENESIS"
        first_hash = rows[0]["row_hash"] if rows else None
        last_hash = rows[-1]["row_hash"] if rows else None

        for idx, r in enumerate(rows):
            row_id = str(r["id"])
            actual_prev = r["prev_hash"]
            actual_row = r["row_hash"]
            created_at = r["created_at"]
            timestamp_str = format_canonical_timestamp(created_at) if created_at else ""
            user_id_str = str(r["changed_by_user_id"]) if r["changed_by_user_id"] else "SYSTEM"
            action = str(r["action"] or "").upper()
            resource = f"{r['entity_type']}:{r['entity_id']}"
            changes_obj = json.loads(r["changes"]) if isinstance(r["changes"], str) else r["changes"]
            canonical_payload = build_canonical_payload(changes=changes_obj, note=r["note"])

            # 1. Verify previous hash linkage
            if actual_prev != expected_prev_hash:
                t_valid = False
                all_valid = False
                err_msg = (
                    f"Chain linkage broken at sequence {idx} (row {row_id}): "
                    f"expected prev_hash '{expected_prev_hash}', found '{actual_prev}'."
                )
                t_errors.append(err_msg)
                tampered_records.append({
                    "id": row_id,
                    "tenant_id": t_id,
                    "sequence": idx,
                    "error_type": "CHAIN_BROKEN",
                    "detail": err_msg,
                })

            # 2. Recalculate row hash
            computed_hash = compute_row_hash(
                tenant_id=t_id,
                prev_hash=actual_prev or "GENESIS",
                timestamp_str=timestamp_str,
                user_id_str=user_id_str,
                action=action,
                resource=resource,
                canonical_payload=canonical_payload,
            )

            if actual_row != computed_hash:
                # Check PostgreSQL enforce_audit_log_hash_chain trigger fallback
                pg_dt_str = created_at.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f+00:00") if created_at else ""
                changes_str = r['changes'] if r['changes'] is not None else '{}'
                raw_trigger = f"{t_id}{actual_prev}{pg_dt_str}{user_id_str}{action}{resource}{changes_str}"
                trigger_hash = hashlib.sha256(raw_trigger.encode("utf-8")).hexdigest()

                if actual_row != trigger_hash:
                    t_valid = False
                    all_valid = False
                    err_msg = (
                        f"Cryptographic digest mismatch at sequence {idx} (row {row_id}): "
                        f"stored row_hash '{actual_row}' != computed '{computed_hash}'."
                    )
                    t_errors.append(err_msg)
                    tampered_records.append({
                        "id": row_id,
                        "tenant_id": t_id,
                        "sequence": idx,
                        "error_type": "HASH_MISMATCH",
                        "detail": err_msg,
                    })

            expected_prev_hash = actual_row

        tenant_reports.append({
            "tenant_id": t_id,
            "records_count": t_count,
            "is_valid": t_valid,
            "genesis_hash": first_hash or "GENESIS",
            "latest_hash": last_hash or "GENESIS",
            "errors": t_errors,
        })

    return {
        "status": "valid" if all_valid else "tampered",
        "compliance_standard": "SOX 404 / ISO 27001",
        "algorithm": "SHA-256 Chained Hash Ledger",
        "verified_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "total_records_checked": total_records,
        "tenants_checked": tenant_reports,
        "tampered_records": tampered_records,
    }
