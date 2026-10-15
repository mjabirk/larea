import os
import uuid
import json
import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, status, Request, Depends, Query, Response
from pydantic import BaseModel

from backend.core.database import get_db_pool
from backend.core.dependencies import get_current_user_session, get_client_ip
from backend.core.mail_engine import encrypt_mail_password, decrypt_mail_password, generate_payslip_pdf_report
from backend.core.communication_engine import (
    sanitize_e164_phone,
    calculate_sms_segments,
    save_whatsapp_media,
    SMSDispatcher,
    WhatsAppMetaService,
    execute_automation_trigger
)

router = APIRouter(prefix="/api/v1/communication", tags=["SMS & WhatsApp Engine"])


# ==============================================================================
# PYDANTIC SCHEMAS
# ==============================================================================

class SMSGatewayPayload(BaseModel):
    name: str
    provider_type: Optional[str] = "generic_http"
    endpoint_url: str
    http_method: Optional[str] = "POST"
    request_format: Optional[str] = "json"
    headers_json: Optional[str] = None
    body_template: Optional[str] = None
    sender_id: Optional[str] = None
    is_default: Optional[bool] = False
    active: Optional[bool] = True


class WhatsAppConfigPayload(BaseModel):
    name: str
    waba_id: str
    phone_number_id: str
    business_phone_number: str
    access_token: Optional[str] = None
    webhook_verify_token: Optional[str] = "apex_enterprise_webhook_token_2026"
    api_version: Optional[str] = "v20.0"
    is_default: Optional[bool] = False
    active: Optional[bool] = True


class WhatsAppTemplatePayload(BaseModel):
    config_id: Optional[str] = None
    template_name: str
    category: Optional[str] = "UTILITY"
    language: Optional[str] = "en_US"
    header_type: Optional[str] = "NONE"
    header_text: Optional[str] = None
    body_text: str
    footer_text: Optional[str] = None
    buttons_json: Optional[str] = None
    model_scope: Optional[str] = "general"
    variable_mapping_json: Optional[str] = None


class AutomationTriggerPayload(BaseModel):
    name: str
    event_type: str
    channel: str
    whatsapp_template_id: Optional[str] = None
    sms_gateway_id: Optional[str] = None
    sms_body_template: Optional[str] = None
    active: Optional[bool] = True


class SendMessagePayload(BaseModel):
    channel: str  # 'whatsapp' or 'sms'
    recipient_phone: str
    recipient_name: Optional[str] = None
    record_model: Optional[str] = None  # e.g. 'payroll.payslip', 'hr.leave', 'hr.employee'
    record_id: Optional[str] = None
    template_id: Optional[str] = None  # WhatsApp template UUID
    variable_values: Optional[Dict[str, str]] = None  # {"1": "Value", "2": "Value"}
    message_text: Optional[str] = None  # SMS or free text
    attach_system_report: Optional[bool] = False
    record_data: Optional[Dict[str, Any]] = None


class TestSMSPayload(BaseModel):
    to_phone: str
    message: Optional[str] = "Apex Global Test SMS: Subsystem operational."


class CalculateSegmentsPayload(BaseModel):
    text: str


# ==============================================================================
# 1. SMS GATEWAYS CRUD & TEST
# ==============================================================================

@router.get("/sms-gateways")
async def list_sms_gateways(session: Dict[str, Any] = Depends(get_current_user_session)):
    """List all SMS gateways."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, name, provider_type, endpoint_url, http_method, request_format,
                   headers_json, body_template, sender_id, is_default, active,
                   created_at, updated_at
            FROM sms_gateways
            ORDER BY is_default DESC, name ASC;
        """)
    gateways = [dict(r) for r in rows]
    for g in gateways:
        g["id"] = str(g["id"])
        g["created_at"] = g["created_at"].isoformat() if g["created_at"] else None
        g["updated_at"] = g["updated_at"].isoformat() if g["updated_at"] else None
    return {"gateways": gateways}


@router.post("/sms-gateways")
async def create_sms_gateway(payload: SMSGatewayPayload, session: Dict[str, Any] = Depends(get_current_user_session)):
    """Create a new SMS gateway."""
    pool = get_db_pool()
    gw_id = uuid.uuid4()
    now = datetime.datetime.now(datetime.timezone.utc)
    async with pool.acquire() as conn:
        if payload.is_default:
            await conn.execute("UPDATE sms_gateways SET is_default = false;")
        await conn.execute("""
            INSERT INTO sms_gateways (
                id, name, provider_type, endpoint_url, http_method, request_format,
                headers_json, body_template, sender_id, is_default, active, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);
        """, gw_id, payload.name, payload.provider_type, payload.endpoint_url,
            payload.http_method, payload.request_format, payload.headers_json,
            payload.body_template, payload.sender_id, payload.is_default, payload.active, now, now)
    return {"id": str(gw_id), "status": "created", "name": payload.name}


@router.put("/sms-gateways/{gw_id}")
async def update_sms_gateway(gw_id: str, payload: SMSGatewayPayload, session: Dict[str, Any] = Depends(get_current_user_session)):
    """Update an SMS gateway."""
    pool = get_db_pool()
    now = datetime.datetime.now(datetime.timezone.utc)
    async with pool.acquire() as conn:
        if payload.is_default:
            await conn.execute("UPDATE sms_gateways SET is_default = false WHERE id != $1::uuid;", gw_id)
        await conn.execute("""
            UPDATE sms_gateways
            SET name = $1, provider_type = $2, endpoint_url = $3, http_method = $4,
                request_format = $5, headers_json = $6, body_template = $7, sender_id = $8,
                is_default = $9, active = $10, updated_at = $11
            WHERE id = $12::uuid;
        """, payload.name, payload.provider_type, payload.endpoint_url, payload.http_method,
            payload.request_format, payload.headers_json, payload.body_template,
            payload.sender_id, payload.is_default, payload.active, now, gw_id)
    return {"id": gw_id, "status": "updated"}


@router.delete("/sms-gateways/{gw_id}")
async def delete_sms_gateway(gw_id: str, session: Dict[str, Any] = Depends(get_current_user_session)):
    """Delete an SMS gateway."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM sms_gateways WHERE id = $1::uuid;", gw_id)
    return {"id": gw_id, "status": "deleted"}


@router.post("/sms-gateways/{gw_id}/test")
async def test_sms_gateway(gw_id: str, payload: TestSMSPayload, session: Dict[str, Any] = Depends(get_current_user_session)):
    """Dispatches a live test SMS through the specified gateway."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM sms_gateways WHERE id = $1::uuid;", gw_id)
        if not row:
            raise HTTPException(status_code=404, detail="SMS Gateway not found.")
        gw_dict = dict(row)

    try:
        clean_phone = sanitize_e164_phone(payload.to_phone)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    success, prov_id, err = SMSDispatcher.send_sms(
        gateway=gw_dict,
        to_phone=clean_phone,
        message=payload.message or "Apex Global Test SMS: Subsystem operational.",
        sender_id=gw_dict.get("sender_id")
    )

    return {
        "success": success,
        "status": "sent" if success else "failed",
        "provider_message_id": prov_id,
        "recipient": clean_phone,
        "error": err
    }


# ==============================================================================
# 2. WHATSAPP CONFIGURATIONS CRUD & CONNECTION TEST
# ==============================================================================

@router.get("/whatsapp-configs")
async def list_whatsapp_configs(session: Dict[str, Any] = Depends(get_current_user_session)):
    """List WhatsApp Business configurations."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, name, waba_id, phone_number_id, business_phone_number,
                   webhook_verify_token, api_version, is_default, active, created_at, updated_at
            FROM whatsapp_configs
            ORDER BY is_default DESC, name ASC;
        """)
    configs = [dict(r) for r in rows]
    for c in configs:
        c["id"] = str(c["id"])
        c["created_at"] = c["created_at"].isoformat() if c["created_at"] else None
        c["updated_at"] = c["updated_at"].isoformat() if c["updated_at"] else None
    return {"configs": configs}


@router.post("/whatsapp-configs")
async def create_whatsapp_config(payload: WhatsAppConfigPayload, session: Dict[str, Any] = Depends(get_current_user_session)):
    """Create WhatsApp Business configuration with AES-256 encrypted access token."""
    pool = get_db_pool()
    cfg_id = uuid.uuid4()
    now = datetime.datetime.now(datetime.timezone.utc)
    enc_token = encrypt_mail_password(payload.access_token or "")

    async with pool.acquire() as conn:
        if payload.is_default:
            await conn.execute("UPDATE whatsapp_configs SET is_default = false;")
        await conn.execute("""
            INSERT INTO whatsapp_configs (
                id, name, waba_id, phone_number_id, business_phone_number,
                access_token_encrypted, webhook_verify_token, api_version, is_default, active,
                created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);
        """, cfg_id, payload.name, payload.waba_id, payload.phone_number_id,
            payload.business_phone_number, enc_token, payload.webhook_verify_token,
            payload.api_version, payload.is_default, payload.active, now, now)
    return {"id": str(cfg_id), "status": "created", "name": payload.name}


@router.put("/whatsapp-configs/{cfg_id}")
async def update_whatsapp_config(cfg_id: str, payload: WhatsAppConfigPayload, session: Dict[str, Any] = Depends(get_current_user_session)):
    """Update WhatsApp Business configuration."""
    pool = get_db_pool()
    now = datetime.datetime.now(datetime.timezone.utc)
    async with pool.acquire() as conn:
        if payload.access_token:
            enc_token = encrypt_mail_password(payload.access_token)
            await conn.execute("UPDATE whatsapp_configs SET access_token_encrypted = $1 WHERE id = $2::uuid;", enc_token, cfg_id)

        if payload.is_default:
            await conn.execute("UPDATE whatsapp_configs SET is_default = false WHERE id != $1::uuid;", cfg_id)

        await conn.execute("""
            UPDATE whatsapp_configs
            SET name = $1, waba_id = $2, phone_number_id = $3, business_phone_number = $4,
                webhook_verify_token = $5, api_version = $6, is_default = $7, active = $8, updated_at = $9
            WHERE id = $10::uuid;
        """, payload.name, payload.waba_id, payload.phone_number_id, payload.business_phone_number,
            payload.webhook_verify_token, payload.api_version, payload.is_default, payload.active, now, cfg_id)
    return {"id": cfg_id, "status": "updated"}


@router.delete("/whatsapp-configs/{cfg_id}")
async def delete_whatsapp_config(cfg_id: str, session: Dict[str, Any] = Depends(get_current_user_session)):
    """Delete WhatsApp configuration."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM whatsapp_configs WHERE id = $1::uuid;", cfg_id)
    return {"id": cfg_id, "status": "deleted"}


@router.post("/whatsapp-configs/{cfg_id}/test")
async def test_whatsapp_config(cfg_id: str, session: Dict[str, Any] = Depends(get_current_user_session)):
    """Tests connection with Meta Cloud API using configured token and Phone Number ID."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM whatsapp_configs WHERE id = $1::uuid;", cfg_id)
        if not row:
            raise HTTPException(status_code=404, detail="WhatsApp Configuration not found.")
        cfg_dict = dict(row)

    res = WhatsAppMetaService.test_connection(cfg_dict)
    return res


# ==============================================================================
# 3. WHATSAPP TEMPLATES CRUD, SUBMISSION & META SYNC
# ==============================================================================

@router.get("/whatsapp-templates")
async def list_whatsapp_templates(
    model_scope: Optional[str] = None,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """List WhatsApp message templates with optional model scope filter."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        if model_scope:
            rows = await conn.fetch("""
                SELECT t.*, c.name as config_name
                FROM whatsapp_templates t
                LEFT JOIN whatsapp_configs c ON t.config_id = c.id
                WHERE t.model_scope = $1 OR t.model_scope = 'general'
                ORDER BY t.template_name ASC;
            """, model_scope)
        else:
            rows = await conn.fetch("""
                SELECT t.*, c.name as config_name
                FROM whatsapp_templates t
                LEFT JOIN whatsapp_configs c ON t.config_id = c.id
                ORDER BY t.approval_status ASC, t.template_name ASC;
            """)

    templates = [dict(r) for r in rows]
    for t in templates:
        t["id"] = str(t["id"])
        t["config_id"] = str(t["config_id"]) if t.get("config_id") else None
        t["created_at"] = t["created_at"].isoformat() if t["created_at"] else None
        t["updated_at"] = t["updated_at"].isoformat() if t["updated_at"] else None
    return {"templates": templates}


@router.post("/whatsapp-templates")
async def create_whatsapp_template(payload: WhatsAppTemplatePayload, session: Dict[str, Any] = Depends(get_current_user_session)):
    """Create a WhatsApp template in draft mode."""
    # Enforce snake_case naming per Meta guidelines
    if not re.match(r"^[a-z0-9_]+$", payload.template_name):
        raise HTTPException(status_code=400, detail="Template name must be strictly lowercase letters, numbers, and underscores (snake_case).")

    pool = get_db_pool()
    tmpl_id = uuid.uuid4()
    now = datetime.datetime.now(datetime.timezone.utc)

    async with pool.acquire() as conn:
        cfg_id = payload.config_id
        if not cfg_id:
            cfg_id = await conn.fetchval("SELECT id FROM whatsapp_configs WHERE is_default = true LIMIT 1;")
        if not cfg_id:
            cfg_id = await conn.fetchval("SELECT id FROM whatsapp_configs ORDER BY created_at ASC LIMIT 1;")
        if not cfg_id:
            raise HTTPException(status_code=400, detail="No WhatsApp account configured to bind this template.")

        await conn.execute("""
            INSERT INTO whatsapp_templates (
                id, config_id, template_name, category, language, header_type,
                header_text, body_text, footer_text, buttons_json, meta_template_id,
                approval_status, model_scope, variable_mapping_json, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, 'DRAFT', $11, $12, $13, $14);
        """, tmpl_id, cfg_id, payload.template_name, payload.category, payload.language,
            payload.header_type, payload.header_text, payload.body_text, payload.footer_text,
            payload.buttons_json, payload.model_scope, payload.variable_mapping_json, now, now)

    return {"id": str(tmpl_id), "status": "created", "template_name": payload.template_name}


@router.put("/whatsapp-templates/{tmpl_id}")
async def update_whatsapp_template(tmpl_id: str, payload: WhatsAppTemplatePayload, session: Dict[str, Any] = Depends(get_current_user_session)):
    """Update a WhatsApp template."""
    pool = get_db_pool()
    now = datetime.datetime.now(datetime.timezone.utc)
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE whatsapp_templates
            SET template_name = $1, category = $2, language = $3, header_type = $4,
                header_text = $5, body_text = $6, footer_text = $7, buttons_json = $8,
                model_scope = $9, variable_mapping_json = $10, updated_at = $11
            WHERE id = $12::uuid;
        """, payload.template_name, payload.category, payload.language, payload.header_type,
            payload.header_text, payload.body_text, payload.footer_text, payload.buttons_json,
            payload.model_scope, payload.variable_mapping_json, now, tmpl_id)
    return {"id": tmpl_id, "status": "updated"}


@router.delete("/whatsapp-templates/{tmpl_id}")
async def delete_whatsapp_template(tmpl_id: str, session: Dict[str, Any] = Depends(get_current_user_session)):
    """Delete a WhatsApp template."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM whatsapp_templates WHERE id = $1::uuid;", tmpl_id)
    return {"id": tmpl_id, "status": "deleted"}


@router.post("/whatsapp-templates/{tmpl_id}/submit-to-meta")
async def submit_whatsapp_template_to_meta(tmpl_id: str, session: Dict[str, Any] = Depends(get_current_user_session)):
    """Submits a template to Meta Developer Graph API for official approval."""
    pool = get_db_pool()
    now = datetime.datetime.now(datetime.timezone.utc)
    async with pool.acquire() as conn:
        tmpl_row = await conn.fetchrow("""
            SELECT t.*, c.waba_id, c.api_version, c.access_token_encrypted
            FROM whatsapp_templates t
            JOIN whatsapp_configs c ON t.config_id = c.id
            WHERE t.id = $1::uuid;
        """, tmpl_id)
        if not tmpl_row:
            raise HTTPException(status_code=404, detail="WhatsApp Template not found.")

        tmpl_dict = dict(tmpl_row)
        config_dict = {
            "waba_id": tmpl_row["waba_id"],
            "api_version": tmpl_row["api_version"],
            "access_token_encrypted": tmpl_row["access_token_encrypted"],
        }

        res = WhatsAppMetaService.submit_template_to_meta(config_dict, tmpl_dict)
        if res.get("success"):
            new_status = res.get("approval_status", "PENDING")
            meta_id = res.get("meta_template_id")
            await conn.execute("""
                UPDATE whatsapp_templates
                SET approval_status = $1, meta_template_id = $2, rejection_reason = NULL, updated_at = $3
                WHERE id = $4::uuid;
            """, new_status, meta_id, now, tmpl_id)
            return {"status": "submitted", "approval_status": new_status, "meta_template_id": meta_id, "message": res.get("message")}
        else:
            await conn.execute("""
                UPDATE whatsapp_templates
                SET approval_status = 'REJECTED', rejection_reason = $1, updated_at = $2
                WHERE id = $3::uuid;
            """, res.get("error"), now, tmpl_id)
            raise HTTPException(status_code=400, detail=res.get("error", "Meta submission failed."))


@router.post("/whatsapp-templates/sync")
async def sync_whatsapp_templates_from_meta(session: Dict[str, Any] = Depends(get_current_user_session)):
    """Synchronizes approval statuses of all templates with Meta WABA."""
    pool = get_db_pool()
    synced_count = 0
    async with pool.acquire() as conn:
        cfg_row = await conn.fetchrow("SELECT * FROM whatsapp_configs WHERE is_default = true AND active = true LIMIT 1;")
        if not cfg_row:
            cfg_row = await conn.fetchrow("SELECT * FROM whatsapp_configs WHERE active = true LIMIT 1;")
        if not cfg_row:
            return {"synced": 0, "message": "No active WhatsApp configuration found."}

        meta_list = WhatsAppMetaService.sync_templates_from_meta(dict(cfg_row))
        for m in meta_list:
            m_name = m.get("name")
            m_status = m.get("status", "APPROVED").upper()
            m_id = m.get("id")
            if m_name:
                updated = await conn.execute("""
                    UPDATE whatsapp_templates
                    SET approval_status = $1, meta_template_id = COALESCE(meta_template_id, $2), updated_at = CURRENT_TIMESTAMP
                    WHERE template_name = $3;
                """, m_status, m_id, m_name)
                synced_count += 1

    return {"synced": synced_count, "status": "success", "message": f"Successfully synchronized {synced_count} templates from Meta."}


# ==============================================================================
# 4. UNIFIED OUTGOING SEND DISPATCHER (MANUAL SEND FROM RECORDS)
# ==============================================================================

@router.post("/send")
async def send_communication_message(
    payload: SendMessagePayload,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Unified communication dispatch engine:
    - Normalizes destination phone via E.164.
    - If channel='whatsapp': enforces APPROVED template, maps variables, binds media report, dispatches via Meta Cloud API.
    - If channel='sms': segments message, calculates encoding, dispatches via default SMS Gateway.
    - Appends entry to communication_logs.
    - Appends entry to audit_logs (Chatter) with action='WHATSAPP' or 'SMS'.
    """
    channel = payload.channel.lower()
    if channel not in ["whatsapp", "sms"]:
        raise HTTPException(status_code=400, detail="Channel must be 'whatsapp' or 'sms'.")

    try:
        clean_phone = sanitize_e164_phone(payload.recipient_phone)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    pool = get_db_pool()
    now = datetime.datetime.now(datetime.timezone.utc)
    comm_log_id = uuid.uuid4()
    sender_name = session.get("username") or session.get("full_name") or "Authorized User"
    client_ip = get_client_ip(request) if request and hasattr(request, "client") and request.client else "127.0.0.1"

    recip_name = payload.recipient_name or "Authorized Staff"
    media_meta = None
    final_body = payload.message_text or ""
    provider_msg_id = None
    error_log = None
    success = False

    async with pool.acquire() as conn:
        if channel == "whatsapp":
            if not payload.template_id:
                raise HTTPException(status_code=400, detail="WhatsApp requires a template_id.")

            tmpl_row = await conn.fetchrow("""
                SELECT t.*, c.waba_id, c.phone_number_id, c.api_version, c.access_token_encrypted, c.business_phone_number
                FROM whatsapp_templates t
                JOIN whatsapp_configs c ON t.config_id = c.id
                WHERE t.id = $1::uuid;
            """, payload.template_id)

            if not tmpl_row:
                raise HTTPException(status_code=404, detail="WhatsApp Template not found.")

            tmpl_dict = dict(tmpl_row)
            config_dict = {
                "waba_id": tmpl_row["waba_id"],
                "phone_number_id": tmpl_row["phone_number_id"],
                "api_version": tmpl_row["api_version"],
                "access_token_encrypted": tmpl_row["access_token_encrypted"],
                "business_phone_number": tmpl_row["business_phone_number"]
            }

            # Map variables
            var_values = payload.variable_values or {}
            final_body = tmpl_dict.get("body_text", "")
            for pos, val in var_values.items():
                final_body = final_body.replace(f"{{{{{pos}}}}}", str(val))

            # If report attachment requested (e.g. Payslip PDF)
            if payload.attach_system_report and payload.record_model and "payslip" in payload.record_model.lower():
                record_data = payload.record_data or {}
                if not record_data.get("employee_name") and payload.record_id:
                    p_db = await conn.fetchrow("SELECT * FROM payslips WHERE id = $1::uuid;", payload.record_id)
                    if p_db:
                        record_data = dict(p_db)
                batch_mock = {"salary_year_month": record_data.get("month", "Monthly"), "name": "Standard Payroll Run"}
                pdf_res = generate_payslip_pdf_report(record_data, batch_mock)
                with open(pdf_res["abs_path"], "rb") as f:
                    media_meta = save_whatsapp_media(pdf_res["filename"], f.read(), "application/pdf")

            success, provider_msg_id, error_log = WhatsAppMetaService.send_template_message(
                config=config_dict,
                to_phone=clean_phone,
                template=tmpl_dict,
                variable_values=var_values,
                media_attachment=media_meta
            )

        elif channel == "sms":
            gw_row = await conn.fetchrow("""
                SELECT * FROM sms_gateways WHERE is_default = true AND active = true LIMIT 1;
            """)
            if not gw_row:
                gw_row = await conn.fetchrow("SELECT * FROM sms_gateways WHERE active = true ORDER BY created_at ASC LIMIT 1;")
            if not gw_row:
                raise HTTPException(status_code=400, detail="No active SMS gateway configured.")

            gw_dict = dict(gw_row)
            success, provider_msg_id, error_log = SMSDispatcher.send_sms(
                gateway=gw_dict,
                to_phone=clean_phone,
                message=final_body,
                sender_id=gw_dict.get("sender_id")
            )

        final_status = "sent" if success else "failed"

        # Record in communication_logs
        await conn.execute("""
            INSERT INTO communication_logs (
                id, channel, direction, recipient_phone, recipient_name,
                message_body, template_id, record_model, record_id,
                status, provider_message_id, error_message, attachment_disk_path, created_at
            ) VALUES ($1, $2, 'outgoing', $3, $4, $5, $6::uuid, $7, $8, $9, $10, $11, $12, $13);
        """, comm_log_id, channel, clean_phone, recip_name, final_body,
            payload.template_id if channel == "whatsapp" else None,
            payload.record_model, payload.record_id, final_status, provider_msg_id,
            error_log, media_meta["disk_path"] if media_meta else None, now)

        # Record in audit_logs (Chatter)
        if payload.record_model and payload.record_id:
            chat_id = uuid.uuid4()
            entity_type = payload.record_model.replace("payroll.", "").replace("hr.", "")
            action_code = "WHATSAPP" if channel == "whatsapp" else "SMS"

            if channel == "whatsapp":
                chatter_note = f"WhatsApp sent to {clean_phone} using template."
                if media_meta:
                    chatter_note += f" Attached file: {media_meta['filename']}."
            else:
                chatter_note = f"SMS sent to {clean_phone}."

            if not success:
                chatter_note = f"{action_code} Delivery failed to {clean_phone}: {error_log}"

            changes_json = json.dumps({
                "channel": channel,
                "recipient": clean_phone,
                "status": final_status,
                "provider_id": provider_msg_id,
                "log_id": str(comm_log_id),
                "attachment": media_meta.get("filename") if media_meta else None
            })

            await conn.execute("""
                INSERT INTO audit_logs (
                    id, entity_type, entity_id, action, changed_by_name, note, changes, ip_address, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9);
            """, chat_id, entity_type, payload.record_id, action_code, sender_name, chatter_note, changes_json, client_ip, now)

    return {
        "status": final_status,
        "log_id": str(comm_log_id),
        "channel": channel,
        "recipient": clean_phone,
        "provider_message_id": provider_msg_id,
        "error": error_log
    }


# ==============================================================================
# 5. COMMUNICATION LOGS & AUDIT HISTORY
# ==============================================================================

@router.get("/logs")
async def list_communication_logs(
    channel: Optional[str] = None,
    status_filter: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(40, ge=1, le=100),
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Retrieve communication logs with Odoo-style high-density pagination."""
    pool = get_db_pool()
    offset = (page - 1) * limit
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT l.*, t.template_name
            FROM communication_logs l
            LEFT JOIN whatsapp_templates t ON l.template_id = t.id
            WHERE ($1::text IS NULL OR l.channel = $1)
              AND ($2::text IS NULL OR l.status = $2)
              AND ($3::text IS NULL OR l.recipient_phone ILIKE '%' || $3 || '%' OR l.recipient_name ILIKE '%' || $3 || '%' OR l.message_body ILIKE '%' || $3 || '%')
            ORDER BY l.created_at DESC
            LIMIT $4 OFFSET $5;
        """, channel, status_filter, search, limit, offset)

        total = await conn.fetchval("""
            SELECT COUNT(*)
            FROM communication_logs l
            WHERE ($1::text IS NULL OR l.channel = $1)
              AND ($2::text IS NULL OR l.status = $2)
              AND ($3::text IS NULL OR l.recipient_phone ILIKE '%' || $3 || '%' OR l.recipient_name ILIKE '%' || $3 || '%' OR l.message_body ILIKE '%' || $3 || '%');
        """, channel, status_filter, search)

    logs = []
    for r in rows:
        d = dict(r)
        d["id"] = str(d["id"])
        d["template_id"] = str(d["template_id"]) if d.get("template_id") else None
        d["created_at"] = d["created_at"].isoformat() if d["created_at"] else None
        logs.append(d)

    return {
        "logs": logs,
        "total": total or 0,
        "page": page,
        "limit": limit
    }


@router.get("/logs/{log_id}")
async def get_communication_log_detail(log_id: str, session: Dict[str, Any] = Depends(get_current_user_session)):
    """Fetch communication log detail."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT l.*, t.template_name
            FROM communication_logs l
            LEFT JOIN whatsapp_templates t ON l.template_id = t.id
            WHERE l.id = $1::uuid;
        """, log_id)
        if not row:
            raise HTTPException(status_code=404, detail="Communication log entry not found.")
        d = dict(row)
        d["id"] = str(d["id"])
        d["template_id"] = str(d["template_id"]) if d.get("template_id") else None
        d["created_at"] = d["created_at"].isoformat() if d["created_at"] else None
        return d


@router.delete("/logs/{log_id}")
async def delete_communication_log(log_id: str, session: Dict[str, Any] = Depends(get_current_user_session)):
    """Delete a communication log record."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM communication_logs WHERE id = $1::uuid;", log_id)
    return {"id": log_id, "status": "deleted"}


# ==============================================================================
# 6. AUTOMATION TRIGGERS CRUD
# ==============================================================================

@router.get("/automation-triggers")
async def list_automation_triggers(session: Dict[str, Any] = Depends(get_current_user_session)):
    """List automation triggers."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT a.*,
                   wt.template_name as whatsapp_template_name,
                   sg.name as sms_gateway_name
            FROM automation_triggers a
            LEFT JOIN whatsapp_templates wt ON a.whatsapp_template_id = wt.id
            LEFT JOIN sms_gateways sg ON a.sms_gateway_id = sg.id
            ORDER BY a.created_at ASC;
        """)
    triggers = []
    for r in rows:
        d = dict(r)
        d["id"] = str(d["id"])
        d["whatsapp_template_id"] = str(d["whatsapp_template_id"]) if d.get("whatsapp_template_id") else None
        d["sms_gateway_id"] = str(d["sms_gateway_id"]) if d.get("sms_gateway_id") else None
        d["created_at"] = d["created_at"].isoformat() if d["created_at"] else None
        triggers.append(d)
    return {"triggers": triggers}


@router.post("/automation-triggers")
async def create_automation_trigger(payload: AutomationTriggerPayload, session: Dict[str, Any] = Depends(get_current_user_session)):
    """Create an automated notification trigger."""
    pool = get_db_pool()
    tr_id = uuid.uuid4()
    now = datetime.datetime.now(datetime.timezone.utc)
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO automation_triggers (
                id, name, event_type, channel, whatsapp_template_id, sms_gateway_id,
                sms_body_template, active, created_at
            ) VALUES ($1, $2, $3, $4, $5::uuid, $6::uuid, $7, $8, $9);
        """, tr_id, payload.name, payload.event_type, payload.channel,
            payload.whatsapp_template_id if payload.channel == "whatsapp" else None,
            payload.sms_gateway_id if payload.channel == "sms" else None,
            payload.sms_body_template, payload.active, now)
    return {"id": str(tr_id), "status": "created", "name": payload.name}


@router.put("/automation-triggers/{tr_id}")
async def update_automation_trigger(tr_id: str, payload: AutomationTriggerPayload, session: Dict[str, Any] = Depends(get_current_user_session)):
    """Update an automation trigger."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE automation_triggers
            SET name = $1, event_type = $2, channel = $3,
                whatsapp_template_id = $4::uuid, sms_gateway_id = $5::uuid,
                sms_body_template = $6, active = $7
            WHERE id = $8::uuid;
        """, payload.name, payload.event_type, payload.channel,
            payload.whatsapp_template_id if payload.channel == "whatsapp" else None,
            payload.sms_gateway_id if payload.channel == "sms" else None,
            payload.sms_body_template, payload.active, tr_id)
    return {"id": tr_id, "status": "updated"}


@router.delete("/automation-triggers/{tr_id}")
async def delete_automation_trigger(tr_id: str, session: Dict[str, Any] = Depends(get_current_user_session)):
    """Delete an automation trigger."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM automation_triggers WHERE id = $1::uuid;", tr_id)
    return {"id": tr_id, "status": "deleted"}


# ==============================================================================
# 7. UTILITIES: SMS SEGMENT CALCULATOR & PHONE NORMALIZER
# ==============================================================================

@router.post("/sms/calculate-segments")
async def api_calculate_sms_segments(payload: CalculateSegmentsPayload):
    """Calculates encoding and concatenated SMS segment statistics for UI character counter."""
    res = calculate_sms_segments(payload.text or "")
    return res


# ==============================================================================
# 8. META WHATSAPP WEBHOOK HANDLER
# ==============================================================================

@router.get("/whatsapp/webhook")
async def verify_whatsapp_webhook(request: Request):
    """Meta Webhook Verification handshake."""
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    pool = get_db_pool()
    async with pool.acquire() as conn:
        valid_token = await conn.fetchval("""
            SELECT webhook_verify_token FROM whatsapp_configs WHERE webhook_verify_token = $1 LIMIT 1;
        """, token)

    if mode == "subscribe" and (valid_token or token == "apex_enterprise_webhook_token_2026"):
        return Response(content=str(challenge), media_type="text/plain")

    raise HTTPException(status_code=403, detail="Webhook verification token mismatch.")


@router.post("/whatsapp/webhook")
async def process_whatsapp_webhook(request: Request):
    """Process incoming WhatsApp delivery status updates (sent, delivered, read, failed)."""
    try:
        body = await request.json()
    except Exception:
        return {"status": "ignored"}

    pool = get_db_pool()
    async with pool.acquire() as conn:
        entry = body.get("entry", [])
        for e in entry:
            changes = e.get("changes", [])
            for c in changes:
                value = c.get("value", {})
                statuses = value.get("statuses", [])
                for s in statuses:
                    wamid = s.get("id")
                    st = s.get("status")  # 'sent', 'delivered', 'read', 'failed'
                    if wamid and st:
                        await conn.execute("""
                            UPDATE communication_logs
                            SET status = $1
                            WHERE provider_message_id = $2;
                        """, st, wamid)

    return {"status": "processed"}
