import os
import uuid
import json
import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, status, Request, Depends, Query, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.core.database import get_db_pool
from backend.core.dependencies import get_current_user_session, get_client_ip
from backend.core.mail_engine import (
    encrypt_mail_password,
    decrypt_mail_password,
    test_mail_server_connection,
    send_smtp_email,
    generate_payslip_pdf_report,
    interpolate_template,
    run_mail_retention_cleanup,
    save_attachment_file,
    sanitize_filename
)

router = APIRouter(prefix="/api/v1/mail", tags=["Mail Engine"])


# ==============================================================================
# PYDANTIC SCHEMAS
# ==============================================================================

class MailServerPayload(BaseModel):
    name: str
    server_type: Optional[str] = "outgoing"  # 'outgoing', 'incoming'
    protocol: Optional[str] = "SMTP"  # 'SMTP', 'IMAP', 'POP3'
    host: str
    port: int = 587
    encryption: Optional[str] = "STARTTLS"  # 'SSL_TLS', 'STARTTLS', 'NONE'
    username: Optional[str] = ""
    password: Optional[str] = None  # Plaintext on input, will be encrypted
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    is_default: Optional[bool] = False
    active: Optional[bool] = True
    auto_purge_mode: Optional[str] = "days"  # 'never', 'immediate', 'days'
    auto_purge_days: Optional[int] = 60


class MailTemplatePayload(BaseModel):
    name: str
    model_scope: Optional[str] = "custom"
    subject: str
    body_html: str
    attach_system_report: Optional[bool] = False
    report_generator_hook: Optional[str] = None
    purge_override: Optional[str] = "inherit"  # 'inherit', 'immediate', 'custom_days'
    purge_days: Optional[int] = None


class SendMailPayload(BaseModel):
    mail_server_id: Optional[str] = None
    template_id: Optional[str] = None
    record_model: Optional[str] = None  # e.g. "payroll.payslip", "hr.employee", "hr.leave"
    record_id: Optional[str] = None
    record_data: Optional[Dict[str, Any]] = None
    to_addresses: List[str]
    cc_addresses: Optional[List[str]] = None
    subject: Optional[str] = None
    body_html: Optional[str] = None
    attach_system_report: Optional[bool] = False
    custom_attachments: Optional[List[Dict[str, Any]]] = None  # [{"filename": "...", "disk_path": "..."}]


# ==============================================================================
# 1. MAIL SERVERS ENDPOINTS
# ==============================================================================

@router.get("/servers")
async def list_mail_servers(session: Dict[str, Any] = Depends(get_current_user_session)):
    """List all configured incoming and outgoing mail servers with masked passwords."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, name, server_type, protocol, host, port, encryption,
                   username, password_encrypted, from_email, from_name,
                   is_default, active, auto_purge_mode, auto_purge_days,
                   last_connection_status, last_connection_error, created_at, updated_at
            FROM mail_servers
            ORDER BY is_default DESC, name ASC;
        """)

    servers = []
    for r in rows:
        servers.append({
            "id": str(r["id"]),
            "name": r["name"],
            "server_type": r["server_type"],
            "protocol": r["protocol"],
            "host": r["host"],
            "port": r["port"],
            "encryption": r["encryption"],
            "username": r["username"] or "",
            "password_configured": bool(r["password_encrypted"]),
            "from_email": r["from_email"],
            "from_name": r["from_name"],
            "is_default": bool(r["is_default"]),
            "active": bool(r["active"]),
            "auto_purge_mode": r["auto_purge_mode"],
            "auto_purge_days": r["auto_purge_days"],
            "last_connection_status": r["last_connection_status"],
            "last_connection_error": r["last_connection_error"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
        })
    return {"servers": servers}


@router.post("/servers")
async def create_mail_server(
    payload: MailServerPayload,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Register a new mail server with AES-256 encrypted credentials."""
    pool = get_db_pool()
    server_id = uuid.uuid4()
    now = datetime.datetime.now(datetime.timezone.utc)
    enc_pwd = encrypt_mail_password(payload.password) if payload.password else None

    async with pool.acquire() as conn:
        if payload.is_default:
            await conn.execute("UPDATE mail_servers SET is_default = false WHERE server_type = $1;", payload.server_type)

        await conn.execute("""
            INSERT INTO mail_servers (
                id, name, server_type, protocol, host, port, encryption,
                username, password_encrypted, from_email, from_name,
                is_default, active, auto_purge_mode, auto_purge_days,
                last_connection_status, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'untested', $16, $16
            );
        """, server_id, payload.name, payload.server_type, payload.protocol, payload.host,
            payload.port, payload.encryption, payload.username, enc_pwd, payload.from_email,
            payload.from_name, payload.is_default, payload.active, payload.auto_purge_mode,
            payload.auto_purge_days, now)

    return {"status": "success", "id": str(server_id), "message": "Mail server registered."}


@router.put("/servers/{server_id}")
async def update_mail_server(
    server_id: str,
    payload: MailServerPayload,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Update mail server settings and optionally update encrypted password."""
    pool = get_db_pool()
    now = datetime.datetime.now(datetime.timezone.utc)

    async with pool.acquire() as conn:
        if payload.is_default:
            await conn.execute("UPDATE mail_servers SET is_default = false WHERE server_type = $1 AND id != $2::uuid;", payload.server_type, server_id)

        if payload.password:
            enc_pwd = encrypt_mail_password(payload.password)
            await conn.execute("""
                UPDATE mail_servers SET
                    name = $1, server_type = $2, protocol = $3, host = $4, port = $5,
                    encryption = $6, username = $7, password_encrypted = $8,
                    from_email = $9, from_name = $10, is_default = $11, active = $12,
                    auto_purge_mode = $13, auto_purge_days = $14, updated_at = $15
                WHERE id = $16::uuid;
            """, payload.name, payload.server_type, payload.protocol, payload.host, payload.port,
                payload.encryption, payload.username, enc_pwd, payload.from_email, payload.from_name,
                payload.is_default, payload.active, payload.auto_purge_mode, payload.auto_purge_days, now, server_id)
        else:
            await conn.execute("""
                UPDATE mail_servers SET
                    name = $1, server_type = $2, protocol = $3, host = $4, port = $5,
                    encryption = $6, username = $7, from_email = $8, from_name = $9,
                    is_default = $10, active = $11, auto_purge_mode = $12, auto_purge_days = $13,
                    updated_at = $14
                WHERE id = $15::uuid;
            """, payload.name, payload.server_type, payload.protocol, payload.host, payload.port,
                payload.encryption, payload.username, payload.from_email, payload.from_name,
                payload.is_default, payload.active, payload.auto_purge_mode, payload.auto_purge_days, now, server_id)

    return {"status": "success", "id": server_id, "message": "Mail server updated."}


@router.delete("/servers/{server_id}")
async def delete_mail_server(
    server_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Delete a mail server configuration."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM mail_servers WHERE id = $1::uuid;", server_id)
    return {"status": "success", "deleted_id": server_id}


@router.post("/servers/{server_id}/test")
async def test_mail_server_endpoint(
    server_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Perform a live protocol handshake verification (SMTP NOOP or IMAP NOOP).
    Updates server connection status and error log in the database.
    """
    pool = get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT id, name, server_type, protocol, host, port, encryption,
                   username, password_encrypted, from_email, from_name
            FROM mail_servers
            WHERE id = $1::uuid;
        """, server_id)

        if not row:
            raise HTTPException(status_code=404, detail="Mail server not found.")

        server_dict = dict(row)
        success, message = test_mail_server_connection(server_dict)

        status_val = "ready" if success else "failed"
        await conn.execute("""
            UPDATE mail_servers
            SET last_connection_status = $1, last_connection_error = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3::uuid;
        """, status_val, None if success else message, server_id)

    return {
        "success": success,
        "status": status_val,
        "message": message
    }


# ==============================================================================
# 2. MAIL TEMPLATES ENDPOINTS
# ==============================================================================

@router.get("/templates")
async def list_mail_templates(
    model_scope: Optional[str] = None,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """List mail templates, optionally filtering by model scope (e.g. 'payroll.payslip')."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        if model_scope:
            rows = await conn.fetch("""
                SELECT id, name, model_scope, subject, body_html, attach_system_report,
                       report_generator_hook, purge_override, purge_days, created_at, updated_at
                FROM mail_templates
                WHERE model_scope = $1 OR model_scope = 'custom'
                ORDER BY name ASC;
            """, model_scope)
        else:
            rows = await conn.fetch("""
                SELECT id, name, model_scope, subject, body_html, attach_system_report,
                       report_generator_hook, purge_override, purge_days, created_at, updated_at
                FROM mail_templates
                ORDER BY model_scope ASC, name ASC;
            """)

    templates = []
    for r in rows:
        templates.append({
            "id": str(r["id"]),
            "name": r["name"],
            "model_scope": r["model_scope"],
            "subject": r["subject"],
            "body_html": r["body_html"],
            "attach_system_report": bool(r["attach_system_report"]),
            "report_generator_hook": r["report_generator_hook"],
            "purge_override": r["purge_override"],
            "purge_days": r["purge_days"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
        })
    return {"templates": templates}


@router.get("/templates/{template_id}")
async def get_mail_template(
    template_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Fetch template detail."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT id, name, model_scope, subject, body_html, attach_system_report,
                   report_generator_hook, purge_override, purge_days, created_at, updated_at
            FROM mail_templates
            WHERE id = $1::uuid;
        """, template_id)
        if not row:
            raise HTTPException(status_code=404, detail="Mail template not found.")

    return {
        "id": str(row["id"]),
        "name": row["name"],
        "model_scope": row["model_scope"],
        "subject": row["subject"],
        "body_html": row["body_html"],
        "attach_system_report": bool(row["attach_system_report"]),
        "report_generator_hook": row["report_generator_hook"],
        "purge_override": row["purge_override"],
        "purge_days": row["purge_days"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
    }


@router.post("/templates")
async def create_mail_template(
    payload: MailTemplatePayload,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Create a new reusable email template."""
    pool = get_db_pool()
    tmpl_id = uuid.uuid4()
    now = datetime.datetime.now(datetime.timezone.utc)

    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO mail_templates (
                id, name, model_scope, subject, body_html,
                attach_system_report, report_generator_hook, purge_override, purge_days,
                created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10);
        """, tmpl_id, payload.name, payload.model_scope, payload.subject, payload.body_html,
            payload.attach_system_report, payload.report_generator_hook, payload.purge_override,
            payload.purge_days, now)

    return {"status": "success", "id": str(tmpl_id), "message": "Mail template created."}


@router.put("/templates/{template_id}")
async def update_mail_template(
    template_id: str,
    payload: MailTemplatePayload,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Update email template configuration."""
    pool = get_db_pool()
    now = datetime.datetime.now(datetime.timezone.utc)

    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE mail_templates SET
                name = $1, model_scope = $2, subject = $3, body_html = $4,
                attach_system_report = $5, report_generator_hook = $6,
                purge_override = $7, purge_days = $8, updated_at = $9
            WHERE id = $10::uuid;
        """, payload.name, payload.model_scope, payload.subject, payload.body_html,
            payload.attach_system_report, payload.report_generator_hook,
            payload.purge_override, payload.purge_days, now, template_id)

    return {"status": "success", "id": template_id, "message": "Mail template updated."}


@router.delete("/templates/{template_id}")
async def delete_mail_template(
    template_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Delete an email template."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM mail_templates WHERE id = $1::uuid;", template_id)
    return {"status": "success", "deleted_id": template_id}


# ==============================================================================
# 3. MAIL DISPATCHER, MESSAGES & CHATTER INTEGRATION
# ==============================================================================

@router.get("/messages")
async def list_mail_messages(
    page: int = Query(1, ge=1),
    limit: int = Query(40, ge=1, le=100),
    search: Optional[str] = None,
    direction: Optional[str] = None,
    status_filter: Optional[str] = None,
    record_model: Optional[str] = None,
    record_id: Optional[str] = None,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    High-density mail log table showing Date, Direction, To/From, Subject, Status, and Attachments.
    """
    pool = get_db_pool()
    offset = (page - 1) * limit

    async with pool.acquire() as conn:
        query = """
            SELECT m.id, m.mail_server_id, m.direction, m.status, m.record_model, m.record_id,
                   m.to_addresses, m.cc_addresses, m.subject, m.sent_at, m.purge_after, m.created_at,
                   s.name as server_name, s.from_email as server_from_email,
                   COUNT(a.id) as attachments_count
            FROM mail_messages m
            LEFT JOIN mail_servers s ON m.mail_server_id = s.id
            LEFT JOIN mail_attachments a ON a.mail_message_id = m.id
            WHERE ($1::text IS NULL OR m.subject ILIKE '%' || $1 || '%' OR m.to_addresses ILIKE '%' || $1 || '%')
              AND ($2::text IS NULL OR m.direction = $2)
              AND ($3::text IS NULL OR m.status = $3)
              AND ($4::text IS NULL OR m.record_model = $4)
              AND ($5::text IS NULL OR m.record_id = $5)
            GROUP BY m.id, s.name, s.from_email
            ORDER BY m.created_at DESC
            LIMIT $6 OFFSET $7;
        """
        rows = await conn.fetch(query, search, direction, status_filter, record_model, record_id, limit, offset)

        total_count = await conn.fetchval("""
            SELECT COUNT(*)
            FROM mail_messages m
            WHERE ($1::text IS NULL OR m.subject ILIKE '%' || $1 || '%' OR m.to_addresses ILIKE '%' || $1 || '%')
              AND ($2::text IS NULL OR m.direction = $2)
              AND ($3::text IS NULL OR m.status = $3)
              AND ($4::text IS NULL OR m.record_model = $4)
              AND ($5::text IS NULL OR m.record_id = $5);
        """, search, direction, status_filter, record_model, record_id)

    messages = []
    for r in rows:
        messages.append({
            "id": str(r["id"]),
            "mail_server_id": str(r["mail_server_id"]) if r["mail_server_id"] else None,
            "server_name": r["server_name"] or "System Default",
            "from_email": r["server_from_email"] or "notifications@company.local",
            "direction": r["direction"],
            "status": r["status"],
            "record_model": r["record_model"],
            "record_id": r["record_id"],
            "to_addresses": r["to_addresses"],
            "cc_addresses": r["cc_addresses"],
            "subject": r["subject"],
            "attachments_count": int(r["attachments_count"]),
            "sent_at": r["sent_at"].isoformat() if r["sent_at"] else None,
            "purge_after": r["purge_after"].isoformat() if r["purge_after"] else None,
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        })

    return {
        "messages": messages,
        "total": total_count or 0,
        "page": page,
        "limit": limit
    }


@router.get("/messages/{message_id}")
async def get_mail_message_detail(
    message_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Retrieve full mail message payload, delivery logs, and attached disk documents."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        msg_row = await conn.fetchrow("""
            SELECT m.id, m.mail_server_id, m.direction, m.status, m.record_model, m.record_id,
                   m.to_addresses, m.cc_addresses, m.subject, m.body_html, m.error_log,
                   m.sent_at, m.purge_after, m.created_at,
                   s.name as server_name, s.from_email as server_from_email, s.host as server_host
            FROM mail_messages m
            LEFT JOIN mail_servers s ON m.mail_server_id = s.id
            WHERE m.id = $1::uuid;
        """, message_id)

        if not msg_row:
            raise HTTPException(status_code=404, detail="Mail message not found.")

        att_rows = await conn.fetch("""
            SELECT id, filename, disk_path, file_size_bytes, mime_type, checksum_sha256, created_at
            FROM mail_attachments
            WHERE mail_message_id = $1::uuid
            ORDER BY filename ASC;
        """, message_id)

    attachments = []
    for a in att_rows:
        attachments.append({
            "id": str(a["id"]),
            "filename": a["filename"],
            "disk_path": a["disk_path"],
            "file_size_bytes": int(a["file_size_bytes"]),
            "mime_type": a["mime_type"],
            "checksum_sha256": a["checksum_sha256"],
            "created_at": a["created_at"].isoformat() if a["created_at"] else None,
        })

    return {
        "id": str(msg_row["id"]),
        "mail_server_id": str(msg_row["mail_server_id"]) if msg_row["mail_server_id"] else None,
        "server_name": msg_row["server_name"] or "System Default",
        "from_email": msg_row["server_from_email"] or "notifications@company.local",
        "server_host": msg_row["server_host"],
        "direction": msg_row["direction"],
        "status": msg_row["status"],
        "record_model": msg_row["record_model"],
        "record_id": msg_row["record_id"],
        "to_addresses": msg_row["to_addresses"],
        "cc_addresses": msg_row["cc_addresses"],
        "subject": msg_row["subject"],
        "body_html": msg_row["body_html"],
        "error_log": msg_row["error_log"],
        "sent_at": msg_row["sent_at"].isoformat() if msg_row["sent_at"] else None,
        "purge_after": msg_row["purge_after"].isoformat() if msg_row["purge_after"] else None,
        "created_at": msg_row["created_at"].isoformat() if msg_row["created_at"] else None,
        "attachments": attachments
    }


@router.post("/send")
async def send_email(
    payload: SendMailPayload,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Full Enterprise Outgoing Dispatcher:
    1. Selects Mail Server (or default active SMTP server).
    2. Interpolates placeholders with live record metadata.
    3. If attach_system_report is enabled, executes PDF report generator hook and saves to disk.
    4. Registers physical attachments in mail_attachments.
    5. Dispatches via SMTP with TLS/SSL.
    6. Syncs event to Record Chatter (audit_logs).
    """
    pool = get_db_pool()
    now = datetime.datetime.now(datetime.timezone.utc)
    message_id = uuid.uuid4()
    sender_name = session.get("username") or session.get("full_name") or "HR Admin"
    client_ip = get_client_ip(request) if request and hasattr(request, "client") and request.client else "127.0.0.1"

    async with pool.acquire() as conn:
        # 1. Fetch outgoing mail server
        if payload.mail_server_id:
            server_row = await conn.fetchrow("""
                SELECT * FROM mail_servers WHERE id = $1::uuid AND active = true;
            """, payload.mail_server_id)
        else:
            server_row = await conn.fetchrow("""
                SELECT * FROM mail_servers 
                WHERE server_type = 'outgoing' AND active = true 
                ORDER BY is_default DESC, created_at ASC LIMIT 1;
            """)

        if not server_row:
            # Fallback mock configuration for testing if none configured
            server_dict = {
                "id": None,
                "name": "Fallback Mock Server",
                "host": "localhost",
                "port": 587,
                "encryption": "STARTTLS",
                "username": "",
                "password_encrypted": "",
                "from_email": "notifications@company.local",
                "from_name": "Apex Global ERP",
                "auto_purge_mode": "days",
                "auto_purge_days": 60
            }
        else:
            server_dict = dict(server_row)

        # 2. Template and Record Context Resolution
        subject_raw = payload.subject or "Notification from Apex Global"
        body_raw = payload.body_html or ""
        attach_report = payload.attach_system_report or False
        report_hook = None
        purge_mode = server_dict.get("auto_purge_mode", "days")
        purge_days = server_dict.get("auto_purge_days", 60)

        if payload.template_id:
            tmpl_row = await conn.fetchrow("""
                SELECT * FROM mail_templates WHERE id = $1::uuid;
            """, payload.template_id)
            if tmpl_row:
                subject_raw = tmpl_row["subject"]
                body_raw = tmpl_row["body_html"]
                attach_report = attach_report or bool(tmpl_row["attach_system_report"])
                report_hook = tmpl_row["report_generator_hook"]
                if tmpl_row["purge_override"] == "immediate":
                    purge_mode = "immediate"
                elif tmpl_row["purge_override"] == "custom_days":
                    purge_mode = "days"
                    purge_days = tmpl_row["purge_days"] or 30

        # Build interpolation context from live DB records
        context: Dict[str, Any] = {
            "company_name": "Apex Global Enterprises Q.P.S.C.",
            "today": now.strftime("%Y-%m-%d"),
            "current_year": str(now.year),
        }

        payslip_record = None
        batch_record = None

        if payload.record_model and payload.record_id:
            model = payload.record_model.lower()
            rec_id = payload.record_id

            if "payslip" in model:
                p_row = await conn.fetchrow("""
                    SELECT p.*, b.salary_year_month as batch_month, b.title as batch_name,
                           e.work_email, e.full_name as emp_full_name, e.department_id as emp_dept,
                           e.job_title as emp_title, e.national_id_number, e.bank_name as emp_bank,
                           e.bank_iban as emp_iban
                    FROM payslips p
                    LEFT JOIN payroll_batches b ON p.batch_id = b.id
                    LEFT JOIN employees e ON p.employee_id = e.id
                    WHERE p.id = $1::uuid;
                """, rec_id)
                if p_row:
                    payslip_record = dict(p_row)
                    batch_record = {"salary_year_month": p_row["batch_month"], "name": p_row["batch_name"]}
                    context.update({
                        "employee_name": p_row["employee_name"] or p_row["emp_full_name"],
                        "employee_number": p_row["employee_number"],
                        "month": p_row["batch_month"] or "Monthly",
                        "department": p_row["department"] or p_row["emp_dept"] or "Operations",
                        "job_title": p_row["job_title"] or p_row["emp_title"] or "Specialist",
                        "base_salary": f"{float(p_row['base_salary'] or 0):,.2f}",
                        "net_salary": f"{float(p_row['net_salary'] or 0):,.2f}",
                        "deductions": f"{float(p_row['deductions'] or 0):,.2f}",
                        "overtime_pay": f"{float(p_row['overtime_pay'] or 0):,.2f}",
                        "bank_name": p_row["bank_name"] or p_row["emp_bank"] or "Qatar National Bank",
                        "bank_iban": p_row["bank_iban"] or p_row["emp_iban"] or "QA••••••••••••",
                        "work_email": p_row["work_email"],
                    })

            elif "employee" in model:
                e_row = await conn.fetchrow("SELECT * FROM employees WHERE id = $1::uuid;", rec_id)
                if e_row:
                    context.update({
                        "employee_name": e_row["full_name"],
                        "employee_number": e_row["employee_number"],
                        "department": e_row["department_id"] or "Operations",
                        "job_title": e_row["job_title"] or "Specialist",
                        "work_email": e_row["work_email"],
                        "hire_date": str(e_row["hire_date"] or ""),
                        "base_salary": f"{float(e_row['base_salary'] or 0):,.2f}",
                    })

            elif "leave" in model:
                l_row = await conn.fetchrow("SELECT * FROM leave_requests WHERE id = $1::uuid;", rec_id)
                if l_row:
                    context.update({
                        "employee_name": l_row["employee_name"],
                        "employee_number": l_row["employee_number"],
                        "leave_type": l_row["leave_type_name"],
                        "start_date": str(l_row["start_date"]),
                        "end_date": str(l_row["end_date"]),
                        "total_days": str(l_row["total_days"]),
                        "status": l_row["approval_status"],
                        "remarks": l_row["reason"] or "Standard annual entitlement",
                    })

        # Merge user-supplied record_data dictionary into context if provided
        if payload.record_data:
            context.update(payload.record_data)
            if not payslip_record and payload.record_model and "payslip" in payload.record_model:
                payslip_record = payload.record_data

        # Apply placeholder interpolation
        final_subject = interpolate_template(subject_raw, context)
        final_body = interpolate_template(body_raw, context)

        # Determine retention purge_after
        purge_after = None
        if purge_mode == "immediate":
            purge_after = now  # Immediate retention cleanup
        elif purge_mode == "days" and purge_days:
            purge_after = now + datetime.timedelta(days=int(purge_days))

        # 3. Insert Initial Mail Message Record (Parent row must exist before attachments)
        to_str = ", ".join(payload.to_addresses)
        cc_str = ", ".join(payload.cc_addresses) if payload.cc_addresses else None

        await conn.execute("""
            INSERT INTO mail_messages (
                id, mail_server_id, direction, status, record_model, record_id,
                to_addresses, cc_addresses, subject, body_html, purge_after, created_at
            ) VALUES ($1, $2, 'outgoing', 'queued', $3, $4, $5, $6, $7, $8, $9, $10);
        """, message_id, server_dict.get("id"), payload.record_model, payload.record_id,
            to_str, cc_str, final_subject, final_body, purge_after, now)

        # 4. Dynamic Attachment Generation & Registration
        dispatched_attachments: List[Dict[str, Any]] = []

        # If system report requested (Payslip PDF)
        if attach_report and payslip_record:
            pdf_meta = generate_payslip_pdf_report(payslip_record, batch_record)
            att_id = uuid.uuid4()
            await conn.execute("""
                INSERT INTO mail_attachments (
                    id, mail_message_id, filename, disk_path, file_size_bytes, mime_type, checksum_sha256, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
            """, att_id, message_id, pdf_meta["filename"], pdf_meta["disk_path"],
                pdf_meta["file_size_bytes"], pdf_meta["mime_type"], pdf_meta["checksum_sha256"], now)
            dispatched_attachments.append(pdf_meta)

        # If custom uploaded disk attachments are provided
        if payload.custom_attachments:
            for c_att in payload.custom_attachments:
                filename = sanitize_filename(c_att.get("filename") or "document.pdf")
                disk_path = c_att.get("disk_path")
                if disk_path:
                    abs_p = os.path.join(os.getcwd(), disk_path)
                    if os.path.exists(abs_p):
                        size_b = os.path.getsize(abs_p)
                        c_id = uuid.uuid4()
                        await conn.execute("""
                            INSERT INTO mail_attachments (
                                id, mail_message_id, filename, disk_path, file_size_bytes, mime_type, checksum_sha256, created_at
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
                        """, c_id, message_id, filename, disk_path, size_b,
                            c_att.get("mime_type", "application/octet-stream"), "custom_sha", now)
                        dispatched_attachments.append({
                            "filename": filename,
                            "disk_path": disk_path,
                            "abs_path": abs_p
                        })

        # 5. Deliver via SMTP
        is_success, error_log = send_smtp_email(
            server_dict=server_dict,
            to_addresses=payload.to_addresses,
            subject=final_subject,
            body_html=final_body,
            cc_addresses=payload.cc_addresses,
            attachments=dispatched_attachments
        )

        final_status = "sent" if is_success else "failed"
        sent_timestamp = now if is_success else None

        await conn.execute("""
            UPDATE mail_messages
            SET status = $1, error_log = $2, sent_at = $3
            WHERE id = $4::uuid;
        """, final_status, error_log, sent_timestamp, message_id)

        # 6. Chatter Integration (audit_logs table)
        if payload.record_model and payload.record_id:
            chat_id = uuid.uuid4()
            entity_type = payload.record_model.replace("payroll.", "").replace("hr.", "")
            att_summary = f"{len(dispatched_attachments)} attachment(s)" if dispatched_attachments else "no attachments"
            chatter_note = f"Email Sent: {final_subject} to {to_str} with {att_summary}."
            
            changes_json = json.dumps({
                "message_id": str(message_id),
                "subject": final_subject,
                "recipients": payload.to_addresses,
                "status": final_status,
                "attachments": [a.get("filename") for a in dispatched_attachments]
            })

            await conn.execute("""
                INSERT INTO audit_logs (
                    id, entity_type, entity_id, action, changed_by_name, note, changes, ip_address, created_at
                ) VALUES ($1, $2, $3, 'EMAIL', $4, $5, $6::jsonb, $7, $8);
            """, chat_id, entity_type, payload.record_id, sender_name, chatter_note, changes_json, client_ip, now)

    return {
        "status": final_status,
        "message_id": str(message_id),
        "subject": final_subject,
        "recipients": payload.to_addresses,
        "attachments_count": len(dispatched_attachments),
        "error": error_log
    }


@router.post("/messages/{message_id}/resend")
async def resend_mail_message(
    message_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Re-attempt delivery of a previously queued or failed mail message."""
    pool = get_db_pool()
    now = datetime.datetime.now(datetime.timezone.utc)

    async with pool.acquire() as conn:
        msg_row = await conn.fetchrow("""
            SELECT m.*, s.host, s.port, s.encryption, s.username, s.password_encrypted,
                   s.from_email, s.from_name
            FROM mail_messages m
            LEFT JOIN mail_servers s ON m.mail_server_id = s.id
            WHERE m.id = $1::uuid;
        """, message_id)

        if not msg_row:
            raise HTTPException(status_code=404, detail="Mail message not found.")

        server_dict = dict(msg_row)
        to_addrs = [addr.strip() for addr in msg_row["to_addresses"].split(",") if addr.strip()]
        cc_addrs = [addr.strip() for addr in msg_row["cc_addresses"].split(",")] if msg_row["cc_addresses"] else None

        # Fetch attachments
        att_rows = await conn.fetch("SELECT * FROM mail_attachments WHERE mail_message_id = $1::uuid;", message_id)
        attachments = [dict(a) for a in att_rows]

        is_success, error_log = send_smtp_email(
            server_dict=server_dict,
            to_addresses=to_addrs,
            subject=msg_row["subject"],
            body_html=msg_row["body_html"] or "",
            cc_addresses=cc_addrs,
            attachments=attachments
        )

        new_status = "sent" if is_success else "failed"
        await conn.execute("""
            UPDATE mail_messages
            SET status = $1, error_log = $2, sent_at = $3
            WHERE id = $4::uuid;
        """, new_status, error_log, now if is_success else None, message_id)

    return {
        "status": new_status,
        "message_id": message_id,
        "error": error_log
    }


@router.delete("/messages/{message_id}")
async def delete_mail_message(
    message_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Delete a mail log entry and unlinks associated physical attachment files from disk."""
    pool = get_db_pool()
    unlinked_files = 0

    async with pool.acquire() as conn:
        # Fetch physical attachments to unlink
        att_rows = await conn.fetch("SELECT disk_path FROM mail_attachments WHERE mail_message_id = $1::uuid;", message_id)
        for att in att_rows:
            p = att["disk_path"]
            if p:
                abs_p = os.path.join(os.getcwd(), p)
                if os.path.exists(abs_p):
                    try:
                        os.remove(abs_p)
                        unlinked_files += 1
                    except Exception:
                        pass

        await conn.execute("DELETE FROM mail_messages WHERE id = $1::uuid;", message_id)

    return {"status": "success", "deleted_id": message_id, "unlinked_files": unlinked_files}


# ==============================================================================
# 4. ATTACHMENT STORAGE & DOWNLOAD ENDPOINTS
# ==============================================================================

@router.get("/attachments/{attachment_id}/download")
async def download_mail_attachment(
    attachment_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Stream download an attachment directly from the storage disk path."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT id, filename, disk_path, mime_type
            FROM mail_attachments
            WHERE id = $1::uuid;
        """, attachment_id)

        if not row:
            raise HTTPException(status_code=404, detail="Attachment metadata not found.")

        disk_path = row["disk_path"]
        abs_path = os.path.join(os.getcwd(), disk_path)
        if not os.path.exists(abs_path):
            raise HTTPException(status_code=404, detail="Physical attachment file missing from storage disk.")

    return FileResponse(
        path=abs_path,
        filename=row["filename"],
        media_type=row["mime_type"] or "application/octet-stream"
    )


@router.post("/attachments/upload")
async def upload_attachment(
    file: UploadFile = File(...),
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Persist an ad-hoc attachment file to storage/mail_attachments/{YYYY}/{MM}/
    Returns metadata for attaching to outgoing emails.
    """
    content = await file.read()
    meta = save_attachment_file(file.filename, content, file.content_type)
    return {
        "status": "success",
        "filename": meta["filename"],
        "disk_path": meta["disk_path"],
        "file_size_bytes": meta["file_size_bytes"],
        "mime_type": meta["mime_type"],
        "checksum_sha256": meta["checksum_sha256"]
    }


# ==============================================================================
# 5. RETENTION AUTO-PURGE MAINTENANCE WORKER
# ==============================================================================

@router.post("/retention/cleanup")
async def trigger_retention_cleanup(
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Manually trigger or schedule the mail retention auto-purge worker."""
    summary = await run_mail_retention_cleanup()
    return summary
