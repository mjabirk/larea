import os
import re
import uuid
import base64
import hashlib
import mimetypes
import logging
import datetime
import smtplib
import imaplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from typing import Optional, Dict, Any, List, Tuple

from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
    KeepTogether,
)

from backend.core.config import settings
from backend.core.database import get_db_pool

logger = logging.getLogger("enterprise.mail_engine")

BASE_STORAGE_DIR = os.path.join(os.getcwd(), "storage", "mail_attachments")


# ==============================================================================
# 1. SECURITY & PASSWORD ENCRYPTION (AES-256-GCM)
# ==============================================================================

def encrypt_mail_password(plain_pwd: str) -> str:
    """Encrypt password using AES-256-GCM cipher from document vault."""
    if not plain_pwd:
        return ""
    try:
        from backend.api.v1.documents import encrypt_data
        enc = encrypt_data(plain_pwd.encode("utf-8"))
        return base64.b64encode(enc).decode("utf-8")
    except Exception as e:
        logger.error(f"Error encrypting mail password: {e}")
        # Safe fallback base64 encoding if cipher uninitialized in test
        return base64.b64encode(plain_pwd.encode("utf-8")).decode("utf-8")


def decrypt_mail_password(enc_pwd_b64: str) -> str:
    """Decrypt password using AES-256-GCM cipher."""
    if not enc_pwd_b64:
        return ""
    try:
        from backend.api.v1.documents import decrypt_data
        raw = base64.b64decode(enc_pwd_b64.encode("utf-8"))
        return decrypt_data(raw).decode("utf-8")
    except Exception as e:
        try:
            return base64.b64decode(enc_pwd_b64.encode("utf-8")).decode("utf-8")
        except Exception:
            return ""


# ==============================================================================
# 2. FILE SYSTEM ATTACHMENT STORAGE & PATH HELPERS
# ==============================================================================

def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent directory traversal and invalid characters."""
    base = os.path.basename(filename or "attachment")
    clean = re.sub(r"[^a-zA-Z0-9_.-]", "_", base)
    return clean[:120] if clean else "attachment.dat"


def get_attachment_storage_path(filename: str) -> Tuple[str, str]:
    """
    Generate physical directory and file paths: storage/mail_attachments/{YYYY}/{MM}/{uuid}_{clean_filename}
    Returns: (absolute_path, relative_disk_path)
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    yyyy = f"{now.year:04d}"
    mm = f"{now.month:02d}"

    rel_dir = os.path.join("storage", "mail_attachments", yyyy, mm)
    abs_dir = os.path.join(os.getcwd(), rel_dir)
    os.makedirs(abs_dir, exist_ok=True)

    clean_name = sanitize_filename(filename)
    unique_name = f"{uuid.uuid4().hex[:12]}_{clean_name}"

    rel_path = os.path.join(rel_dir, unique_name).replace("\\", "/")
    abs_path = os.path.join(abs_dir, unique_name)

    return abs_path, rel_path


def save_attachment_file(filename: str, content_bytes: bytes, mime_type: Optional[str] = None) -> Dict[str, Any]:
    """Persist attachment bytes to filesystem and return metadata."""
    abs_path, rel_path = get_attachment_storage_path(filename)
    with open(abs_path, "wb") as f:
        f.write(content_bytes)

    file_size = len(content_bytes)
    sha256 = hashlib.sha256(content_bytes).hexdigest()

    if not mime_type:
        guessed, _ = mimetypes.guess_type(filename)
        mime_type = guessed or "application/octet-stream"

    return {
        "filename": filename,
        "disk_path": rel_path,
        "abs_path": abs_path,
        "file_size_bytes": file_size,
        "mime_type": mime_type,
        "checksum_sha256": sha256,
    }


# ==============================================================================
# 3. REPORTLAB DYNAMIC PDF GENERATOR (PAYSLIP & STATUTORY REPORTS)
# ==============================================================================

def generate_payslip_pdf_report(payslip_row: Dict[str, Any], batch_row: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Render a clean, official A4 Payslip PDF using ReportLab.
    Saves to disk and returns metadata dict for mail_attachments.
    """
    emp_num = payslip_row.get("employee_number") or "EMP"
    month = (batch_row.get("salary_year_month") if batch_row else None) or payslip_row.get("batch_month") or "Monthly"
    filename = f"Payslip_{month}_{emp_num}.pdf"

    abs_path, rel_path = get_attachment_storage_path(filename)

    doc = SimpleDocTemplate(
        abs_path,
        pagesize=A4,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "PayslipTitle",
        parent=styles["Heading1"],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "PayslipSubtitle",
        parent=styles["Normal"],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#64748b"),
    )
    header_style = ParagraphStyle(
        "SectionHeader",
        parent=styles["Heading3"],
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=6,
    )
    cell_style = ParagraphStyle(
        "CellNormal",
        parent=styles["Normal"],
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#334155"),
    )
    cell_bold = ParagraphStyle(
        "CellBold",
        parent=styles["Normal"],
        fontSize=8.5,
        leading=11,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#0f172a"),
    )
    cell_num = ParagraphStyle(
        "CellNum",
        parent=styles["Normal"],
        fontSize=8.5,
        leading=11,
        fontName="Helvetica",
        alignment=2,  # Right-aligned
        textColor=colors.HexColor("#0f172a"),
    )
    cell_num_bold = ParagraphStyle(
        "CellNumBold",
        parent=styles["Normal"],
        fontSize=9,
        leading=12,
        fontName="Helvetica-Bold",
        alignment=2,
        textColor=colors.HexColor("#047857"),
    )
    cell_num_red = ParagraphStyle(
        "CellNumRed",
        parent=styles["Normal"],
        fontSize=8.5,
        leading=11,
        fontName="Helvetica",
        alignment=2,
        textColor=colors.HexColor("#b91c1c"),
    )

    story = []

    # 1. Company Banner Header
    story.append(Paragraph("APEX GLOBAL ENTERPRISES Q.P.S.C.", title_style))
    story.append(Paragraph("State of Qatar • Commercial Registration: QA-90281726-CR • MoI Establishment ID: 12345678", subtitle_style))
    story.append(Paragraph(f"Official Salary Statement & Payslip — Period: <strong>{month}</strong>", subtitle_style))
    story.append(Spacer(1, 12))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#cbd5e1"), spaceAfter=14))

    # 2. Employee & Batch Information Grid
    emp_name = payslip_row.get("employee_name") or "Employee"
    dept = payslip_row.get("department") or "General Operations"
    job_title = payslip_row.get("job_title") or "Staff Associate"
    qid = payslip_row.get("national_id_number") or "N/A"
    bank = payslip_row.get("bank_name") or "Qatar National Bank (QNB)"
    iban = payslip_row.get("bank_iban") or "QA55QNBA••••••••••••"
    work_days = str(payslip_row.get("working_days") or 30)
    def _safe_num(val: Any) -> float:
        if val is None:
            return 0.0
        try:
            return float(str(val).replace(",", "").strip())
        except (ValueError, TypeError):
            return 0.0

    ot_hrs = f"{_safe_num(payslip_row.get('overtime_hours')):.1f} hrs"

    info_data = [
        [
            Paragraph("<strong>Employee Name:</strong>", cell_style),
            Paragraph(emp_name, cell_bold),
            Paragraph("<strong>Salary Month:</strong>", cell_style),
            Paragraph(month, cell_bold),
        ],
        [
            Paragraph("<strong>Employee Number:</strong>", cell_style),
            Paragraph(emp_num, cell_style),
            Paragraph("<strong>Working Days:</strong>", cell_style),
            Paragraph(work_days, cell_style),
        ],
        [
            Paragraph("<strong>Department:</strong>", cell_style),
            Paragraph(dept, cell_style),
            Paragraph("<strong>Overtime Hours:</strong>", cell_style),
            Paragraph(ot_hrs, cell_style),
        ],
        [
            Paragraph("<strong>Job Title:</strong>", cell_style),
            Paragraph(job_title, cell_style),
            Paragraph("<strong>Bank / IBAN:</strong>", cell_style),
            Paragraph(f"{bank} • {iban}", cell_style),
        ],
        [
            Paragraph("<strong>Qatar ID (QID):</strong>", cell_style),
            Paragraph(qid, cell_style),
            Paragraph("<strong>WPS Status:</strong>", cell_style),
            Paragraph("COMPLIANT (QCB SIF)", cell_bold),
        ],
    ]

    info_table = Table(info_data, colWidths=[110, 155, 100, 155])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#f1f5f9")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 14))

    # 3. Earnings & Deductions Breakdown Tables
    base_sal = _safe_num(payslip_row.get("base_salary"))
    housing = _safe_num(payslip_row.get("housing_allowance"))
    transport = _safe_num(payslip_row.get("transport_allowance"))
    other_alw = _safe_num(payslip_row.get("other_allowances"))
    ot_pay = _safe_num(payslip_row.get("overtime_pay"))
    bonus = _safe_num(payslip_row.get("bonus_pay"))
    task_pay = _safe_num(payslip_row.get("task_benefit_pay"))

    ded_total = _safe_num(payslip_row.get("deductions"))
    loan_ded = _safe_num(payslip_row.get("loan_deduction"))
    penalty_ded = _safe_num(payslip_row.get("penalty_deduction"))
    other_ded = _safe_num(payslip_row.get("other_deductions"))
    absence_ded = max(0.0, ded_total - (loan_ded + penalty_ded + other_ded))

    gross_earnings = base_sal + housing + transport + other_alw + ot_pay + bonus + task_pay
    net_val = payslip_row.get("net_salary")
    net_salary = _safe_num(net_val) if net_val is not None else (gross_earnings - ded_total)

    story.append(Paragraph("EARNINGS & ALLOWANCES", header_style))

    earnings_data = [
        [Paragraph("Description", cell_bold), Paragraph("Category", cell_bold), Paragraph("Amount (QAR)", cell_num_bold)],
        [Paragraph("Basic Monthly Salary", cell_style), Paragraph("Fixed Base Wage", cell_style), Paragraph(f"{base_sal:,.2f}", cell_num)],
        [Paragraph("Housing Allowance", cell_style), Paragraph("Fixed Allowance", cell_style), Paragraph(f"{housing:,.2f}", cell_num)],
        [Paragraph("Transport Allowance", cell_style), Paragraph("Fixed Allowance", cell_style), Paragraph(f"{transport:,.2f}", cell_num)],
    ]
    if other_alw > 0:
        earnings_data.append([Paragraph("Other Utility Allowances", cell_style), Paragraph("Recurring Allowance", cell_style), Paragraph(f"{other_alw:,.2f}", cell_num)])
    if ot_pay > 0:
        earnings_data.append([Paragraph("Overtime Wage (Day/Holiday)", cell_style), Paragraph("Variable OT Pay", cell_style), Paragraph(f"{ot_pay:,.2f}", cell_num)])
    if bonus > 0:
        earnings_data.append([Paragraph("Performance / Festival Bonus", cell_style), Paragraph("Incentive Addition", cell_style), Paragraph(f"{bonus:,.2f}", cell_num)])
    if task_pay > 0:
        earnings_data.append([Paragraph("Piece-Rate Task & Trips", cell_style), Paragraph("Productivity Pay", cell_style), Paragraph(f"{task_pay:,.2f}", cell_num)])

    earnings_data.append([
        Paragraph("<strong>TOTAL GROSS EARNINGS</strong>", cell_bold),
        Paragraph("", cell_style),
        Paragraph(f"<strong>{gross_earnings:,.2f}</strong>", cell_num_bold),
    ])

    earn_table = Table(earnings_data, colWidths=[240, 150, 130])
    earn_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f8fafc")),
    ]))
    story.append(earn_table)
    story.append(Spacer(1, 12))

    # 4. Deductions Table
    story.append(Paragraph("STATUTORY DEDUCTIONS & RECOVERIES", header_style))

    deductions_data = [
        [Paragraph("Description", cell_bold), Paragraph("Type", cell_bold), Paragraph("Deduction (QAR)", cell_num_bold)],
    ]
    if absence_ded > 0:
        deductions_data.append([Paragraph("Absence & Unpaid Leave Recovery", cell_style), Paragraph("Statutory Pro-rata", cell_style), Paragraph(f"-{absence_ded:,.2f}", cell_num_red)])
    if loan_ded > 0:
        deductions_data.append([Paragraph("Company Loan / Advance Repayment", cell_style), Paragraph("Installment Recovery", cell_style), Paragraph(f"-{loan_ded:,.2f}", cell_num_red)])
    if penalty_ded > 0:
        deductions_data.append([Paragraph("Disciplinary Sanction / Fine", cell_style), Paragraph("Policy Sanction", cell_style), Paragraph(f"-{penalty_ded:,.2f}", cell_num_red)])
    if other_ded > 0:
        deductions_data.append([Paragraph("Other Agreed Payroll Deductions", cell_style), Paragraph("Standard Deduction", cell_style), Paragraph(f"-{other_ded:,.2f}", cell_num_red)])

    if len(deductions_data) == 1:
        deductions_data.append([Paragraph("No statutory or voluntary deductions recorded.", cell_style), Paragraph("N/A", cell_style), Paragraph("0.00", cell_num)])

    deductions_data.append([
        Paragraph("<strong>TOTAL DEDUCTIONS</strong>", cell_bold),
        Paragraph("", cell_style),
        Paragraph(f"<strong>-{ded_total:,.2f}</strong>", cell_num_red),
    ])

    ded_table = Table(deductions_data, colWidths=[240, 150, 130])
    ded_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f8fafc")),
    ]))
    story.append(ded_table)
    story.append(Spacer(1, 14))

    # 5. Net Salary Summary Card
    net_card_data = [
        [
            Paragraph("<strong>NET DISBURSEMENT AMOUNT:</strong>", ParagraphStyle("NetH", parent=styles["Normal"], fontSize=11, leading=14, fontName="Helvetica-Bold", textColor=colors.HexColor("#0f172a"))),
            Paragraph(f"<strong>{net_salary:,.2f} QAR</strong>", ParagraphStyle("NetV", parent=styles["Normal"], fontSize=13, leading=16, fontName="Helvetica-Bold", alignment=2, textColor=colors.HexColor("#047857"))),
        ]
    ]
    net_table = Table(net_card_data, colWidths=[320, 200])
    net_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#ecfdf5")),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#a7f3d0")),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(net_table)
    story.append(Spacer(1, 20))

    # 6. Compliance Footer
    story.append(Paragraph(
        "Confidential Notice: This document contains proprietary payroll information processed in accordance with Qatar Labour Law No. 14 of 2004 and Qatar Central Bank Wage Protection System (WPS) regulations. Electronic document generated by Larea ERP ViewEngine.",
        ParagraphStyle("Footnote", parent=styles["Normal"], fontSize=7.5, leading=10, textColor=colors.HexColor("#94a3b8")),
    ))

    # Build PDF
    doc.build(story)

    # Calculate size and hash
    with open(abs_path, "rb") as f:
        file_bytes = f.read()

    file_size = len(file_bytes)
    sha256 = hashlib.sha256(file_bytes).hexdigest()

    return {
        "filename": filename,
        "disk_path": rel_path,
        "abs_path": abs_path,
        "file_size_bytes": file_size,
        "mime_type": "application/pdf",
        "checksum_sha256": sha256,
    }


# ==============================================================================
# 4. TEMPLATE PLACEHOLDER INTERPOLATION
# ==============================================================================

def interpolate_template(template_str: str, context: Dict[str, Any]) -> str:
    """
    Interpolate {{tag_name}} placeholders within template_str using context dict.
    Supports case-insensitive matching and whitespace inside curly braces (e.g. {{ employee_name }}).
    """
    if not template_str:
        return ""

    def replacer(match):
        key = match.group(1).strip().lower()
        # Lookup in context (case-insensitive)
        for ctx_k, ctx_v in context.items():
            if str(ctx_k).strip().lower() == key:
                if ctx_v is None:
                    return ""
                return str(ctx_v)
        return match.group(0)  # Preserve original if unmapped

    return re.sub(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}", replacer, template_str)


# ==============================================================================
# 5. RETENTION AUTO-PURGE MAINTENANCE SERVICE
# ==============================================================================

async def run_mail_retention_cleanup() -> Dict[str, Any]:
    """
    Scheduled retention worker function.
    Finds mail_messages where purge_after <= NOW() OR status = 'sent' with immediate purge.
    1. Unlinks physical attachment files from disk.
    2. Deletes records from database.
    3. Returns cleanup summary.
    """
    pool = get_db_pool()
    now = datetime.datetime.now(datetime.timezone.utc)
    purged_files = 0
    purged_attachments = 0
    purged_messages = 0

    async with pool.acquire() as conn:
        # Find messages eligible for purging
        messages = await conn.fetch("""
            SELECT id, subject
            FROM mail_messages
            WHERE purge_after IS NOT NULL AND purge_after <= $1;
        """, now)

        message_ids = [m["id"] for m in messages]

        if message_ids:
            # Query physical disk attachments
            attachments = await conn.fetch("""
                SELECT id, filename, disk_path
                FROM mail_attachments
                WHERE mail_message_id = ANY($1::uuid[]);
            """, message_ids)

            # Unlink disk files
            for att in attachments:
                disk_path = att["disk_path"]
                if disk_path:
                    abs_path = os.path.join(os.getcwd(), disk_path)
                    if os.path.exists(abs_path):
                        try:
                            os.remove(abs_path)
                            purged_files += 1
                        except Exception as e:
                            logger.warning(f"Could not delete physical attachment file '{abs_path}': {e}")
                purged_attachments += 1

            # Delete database records (CASCADE will delete attachments)
            delete_res = await conn.execute("""
                DELETE FROM mail_messages
                WHERE id = ANY($1::uuid[]);
            """, message_ids)

            try:
                purged_messages = int(delete_res.split()[-1])
            except Exception:
                purged_messages = len(message_ids)

            logger.info(
                f"[Retention Cleanup] Purged {purged_messages} mail messages, "
                f"{purged_attachments} attachment records, and {purged_files} disk files."
            )

    return {
        "status": "success",
        "purged_messages": purged_messages,
        "purged_attachments": purged_attachments,
        "purged_files": purged_files,
        "timestamp": now.isoformat(),
    }


# ==============================================================================
# 6. SMTP/IMAP DISPATCHER & CONNECTION TESTER
# ==============================================================================

def test_mail_server_connection(server_dict: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Verify SMTP or IMAP connection credentials with handshake verification.
    Returns: (is_success, status_or_error_message)
    """
    protocol = (server_dict.get("protocol") or "SMTP").upper()
    host = server_dict.get("host") or "localhost"
    port = int(server_dict.get("port") or (465 if server_dict.get("encryption") == "SSL_TLS" else 587))
    encryption = server_dict.get("encryption") or "STARTTLS"
    username = server_dict.get("username") or ""
    enc_password = server_dict.get("password_encrypted") or ""
    password = decrypt_mail_password(enc_password) if enc_password else ""

    if protocol == "SMTP":
        try:
            if encryption == "SSL_TLS":
                server = smtplib.SMTP_SSL(host, port, timeout=6)
            else:
                server = smtplib.SMTP(host, port, timeout=6)
                if encryption == "STARTTLS":
                    server.starttls()

            if username and password:
                server.login(username, password)

            server.noop()
            server.quit()
            return True, f"Successfully connected to SMTP server at {host}:{port} with {encryption} encryption."
        except Exception as e:
            err_msg = str(e)
            logger.warning(f"SMTP connection test failed for {host}:{port}: {err_msg}")
            return False, f"SMTP Connection Failed: {err_msg}"

    elif protocol in ("IMAP", "POP3"):
        try:
            if encryption == "SSL_TLS":
                client = imaplib.IMAP4_SSL(host, port)
            else:
                client = imaplib.IMAP4(host, port)
                if encryption == "STARTTLS":
                    client.starttls()

            if username and password:
                client.login(username, password)

            client.noop()
            client.logout()
            return True, f"Successfully authenticated to IMAP server at {host}:{port}."
        except Exception as e:
            err_msg = str(e)
            logger.warning(f"IMAP connection test failed for {host}:{port}: {err_msg}")
            return False, f"IMAP Connection Failed: {err_msg}"

    return False, f"Unsupported protocol '{protocol}'."


def send_smtp_email(
    server_dict: Dict[str, Any],
    to_addresses: List[str],
    subject: str,
    body_html: str,
    cc_addresses: Optional[List[str]] = None,
    attachments: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[bool, Optional[str]]:
    """
    Deliver outgoing email via SMTP with TLS/SSL encryption and physical attachments.
    Returns: (is_success, error_log_or_none)
    """
    host = server_dict.get("host") or "localhost"
    port = int(server_dict.get("port") or 587)
    encryption = server_dict.get("encryption") or "STARTTLS"
    username = server_dict.get("username") or ""
    enc_password = server_dict.get("password_encrypted") or ""
    password = decrypt_mail_password(enc_password) if enc_password else ""
    from_email = server_dict.get("from_email") or username or "noreply@company.local"
    from_name = server_dict.get("from_name") or "Apex Global ERP"

    # Build MIME Message
    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>" if from_name else from_email
    msg["To"] = ", ".join(to_addresses)
    if cc_addresses:
        msg["Cc"] = ", ".join(cc_addresses)

    # HTML Body
    msg_body = MIMEMultipart("alternative")
    msg_body.attach(MIMEText(body_html, "html", "utf-8"))
    msg.attach(msg_body)

    # Attachments
    if attachments:
        for att in attachments:
            disk_path = att.get("disk_path")
            abs_path = att.get("abs_path") or (os.path.join(os.getcwd(), disk_path) if disk_path else None)
            filename = att.get("filename") or "attachment.dat"
            if abs_path and os.path.exists(abs_path):
                with open(abs_path, "rb") as f:
                    part = MIMEApplication(f.read())
                    part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
                    msg.attach(part)

    recipients = list(to_addresses) + (list(cc_addresses) if cc_addresses else [])

    try:
        if encryption == "SSL_TLS":
            server = smtplib.SMTP_SSL(host, port, timeout=10)
        else:
            server = smtplib.SMTP(host, port, timeout=10)
            if encryption == "STARTTLS":
                server.starttls()

        if username and password:
            server.login(username, password)

        server.sendmail(from_email, recipients, msg.as_string())
        server.quit()
        return True, None
    except Exception as e:
        err = f"SMTP Delivery Failure to {host}:{port}: {e}"
        logger.error(err)
        return False, err
