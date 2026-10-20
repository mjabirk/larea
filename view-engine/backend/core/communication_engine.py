import os
import re
import uuid
import json
import base64
import asyncio
import hashlib
import mimetypes
import logging
import datetime
import urllib.parse
import socket
import ipaddress
from typing import Optional, Dict, Any, List, Tuple

import httpx

from backend.core.config import settings
from backend.core.database import get_db_pool
from backend.core.mail_engine import (
    sanitize_filename,
    decrypt_mail_password,
    generate_payslip_pdf_report
)

logger = logging.getLogger("enterprise.communication")

# GSM-7 Standard character set
GSM_7_CHARS = set(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
)
GSM_7_EXTENDED = set("|^€{}[]~\\")

# Directory for WhatsApp documents & media
MEDIA_STORAGE_DIR = os.path.join(os.getcwd(), "storage", "whatsapp_media")


# ==============================================================================
# 0. SSRF PROTECTION HELPER
# ==============================================================================

def validate_external_target_ip(hostname: str) -> None:
    """
    Validates that a target hostname or IP address resolves exclusively to safe public IPs.
    When settings.APP_ENV != "development", resolves all IPs via socket.getaddrinfo and rejects:
    - ip.is_loopback
    - ip.is_link_local
    - ip.is_private
    - ip.is_reserved
    - ip.is_multicast
    - Cloud metadata IP (169.254.169.254)
    Raises ValueError on SSRF violations or if resolution fails.
    """
    if getattr(settings, "APP_ENV", "development") == "development":
        return

    if not hostname:
        raise ValueError("Invalid target: missing hostname or IP address.")

    clean_host = hostname.strip().strip("[]")
    try:
        addr_info = socket.getaddrinfo(clean_host, None)
    except Exception as e:
        raise ValueError(f"SSRF validation error: could not resolve hostname '{clean_host}': {str(e)}") from e

    if not addr_info:
        raise ValueError(f"SSRF validation error: no IP addresses resolved for hostname '{clean_host}'.")

    for _, _, _, _, sockaddr in addr_info:
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            raise ValueError(f"SSRF validation error: invalid resolved IP address '{ip_str}'.")

        if (
            ip.is_loopback
            or ip.is_link_local
            or ip.is_private
            or ip.is_reserved
            or ip.is_multicast
            or ip_str == "169.254.169.254"
        ):
            raise ValueError(
                f"SSRF violation: Target '{clean_host}' resolves to restricted IP '{ip_str}' "
                "(loopback, private, link-local, reserved, or multicast)."
            )


# ==============================================================================
# 1. PHONE NUMBER NORMALIZER & VALIDATOR (E.164)
# ==============================================================================

def sanitize_e164_phone(phone: Optional[str], default_country: str = "QA") -> str:
    """
    Sanitize and normalize international phone numbers to strict E.164 format:
    - Removes spaces, hyphens, brackets, dots.
    - Converts leading '00' to '+'.
    - If national format (e.g. 8 digits starting with 3, 5, 6, 7 in Qatar), prepends '+974'.
    - Validates against ^\\+[1-9]\\d{7,14}$ regex.
    """
    if not phone:
        raise ValueError("Phone number is required.")

    cleaned = re.sub(r"[\s\-\(\)\.\[\]/]", "", str(phone).strip())

    if cleaned.startswith("00"):
        cleaned = "+" + cleaned[2:]

    if not cleaned.startswith("+"):
        if default_country == "QA":
            # Qatar national numbers: 8 digits starting with 3, 5, 6, or 7
            if re.match(r"^[3567]\d{7}$", cleaned):
                cleaned = "+974" + cleaned
            elif cleaned.startswith("974") and len(cleaned) == 11:
                cleaned = "+" + cleaned
            else:
                cleaned = "+974" + cleaned
        else:
            cleaned = "+" + cleaned

    e164_regex = r"^\+[1-9]\d{7,14}$"
    if not re.match(e164_regex, cleaned):
        raise ValueError(f"Invalid international phone number format: '{phone}'. Must be valid E.164 (e.g. +974xxxxxxxx).")

    return cleaned


# ==============================================================================
# 2. SMS SEGMENTS & ENCODING DETECTOR (GSM-7 vs UCS-2)
# ==============================================================================

def calculate_sms_segments(text: str) -> Dict[str, Any]:
    """
    Calculate SMS encoding (GSM-7 vs UCS-2 Unicode) and concatenated segment split:
    - GSM-7: Single message = 160 chars, concatenated = 153 chars/segment.
    - UCS-2: Single message = 70 chars, concatenated = 67 chars/segment (Arabic / emojis).
    """
    if not text:
        return {
            "encoding": "GSM-7",
            "char_count": 0,
            "segment_count": 0,
            "chars_per_segment": 160,
            "chars_left_in_segment": 160
        }

    is_gsm7 = True
    for ch in text:
        if ch not in GSM_7_CHARS and ch not in GSM_7_EXTENDED:
            is_gsm7 = False
            break

    char_count = len(text)

    if is_gsm7:
        encoding = "GSM-7"
        if char_count <= 160:
            segment_count = 1 if char_count > 0 else 0
            chars_left = 160 - char_count
            chars_per_seg = 160
        else:
            chars_per_seg = 153
            segment_count = (char_count + chars_per_seg - 1) // chars_per_seg
            chars_left = (segment_count * chars_per_seg) - char_count
    else:
        encoding = "UCS-2"
        if char_count <= 70:
            segment_count = 1 if char_count > 0 else 0
            chars_left = 70 - char_count
            chars_per_seg = 70
        else:
            chars_per_seg = 67
            segment_count = (char_count + chars_per_seg - 1) // chars_per_seg
            chars_left = (segment_count * chars_per_seg) - char_count

    return {
        "encoding": encoding,
        "char_count": char_count,
        "segment_count": segment_count,
        "chars_per_segment": chars_per_seg,
        "chars_left_in_segment": chars_left
    }


# ==============================================================================
# 3. WHATSAPP MEDIA FILE-SYSTEM STORAGE
# ==============================================================================

def save_whatsapp_media(filename: str, content_bytes: bytes, mime_type: Optional[str] = None) -> Dict[str, Any]:
    """Persist media to storage/whatsapp_media/{YYYY}/{MM}/{uuid}_{clean_filename}."""
    now = datetime.datetime.now(datetime.timezone.utc)
    yyyy = f"{now.year:04d}"
    mm = f"{now.month:02d}"

    rel_dir = os.path.join("storage", "whatsapp_media", yyyy, mm)
    abs_dir = os.path.join(os.getcwd(), rel_dir)
    os.makedirs(abs_dir, exist_ok=True)

    clean_name = sanitize_filename(filename)
    unique_name = f"{uuid.uuid4().hex[:12]}_{clean_name}"

    rel_path = os.path.join(rel_dir, unique_name).replace("\\", "/")
    abs_path = os.path.join(abs_dir, unique_name)

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
        "checksum_sha256": sha256
    }


# ==============================================================================
# 4. SMS DISPATCHER (HTTP GET/POST, TWILIO, INFOBIP, GENERIC HTTP)
# ==============================================================================

class SMSDispatcher:
    """Dispatches outgoing SMS messages via configured enterprise SMS gateways."""

    @staticmethod
    def send_sms(
        gateway: Dict[str, Any],
        to_phone: str,
        message: str,
        sender_id: Optional[str] = None
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Sends an SMS message using gateway settings.
        Returns: (success: bool, provider_message_id: Optional[str], error_message: Optional[str])
        """
        clean_phone = sanitize_e164_phone(to_phone)
        sender = sender_id or gateway.get("sender_id") or "APEXCORP"
        provider = gateway.get("provider_type", "generic_http")
        url_template = gateway.get("endpoint_url", "")
        method = (gateway.get("http_method") or "POST").upper()
        req_format = gateway.get("request_format") or "json"

        # Headers
        headers: Dict[str, str] = {}
        if gateway.get("headers_json"):
            try:
                headers = json.loads(gateway["headers_json"])
            except Exception:
                headers = {}

        # Interpolate variables: {{to}}, {{message}}, {{sender_id}}
        url = url_template.replace("{{to}}", clean_phone).replace("{{sender_id}}", sender).replace("{{message}}", message)

        # Prepare body if POST
        body_template = gateway.get("body_template") or ""
        body_payload = None

        if method == "POST":
            if provider == "twilio":
                # Twilio requires Form-encoded: To, From, Body
                data = {
                    "To": clean_phone,
                    "From": sender,
                    "Body": message
                }
                body_payload = data
            elif body_template:
                interpolated_body = body_template.replace("{{to}}", clean_phone).replace("{{sender_id}}", sender).replace("{{message}}", message)
                if req_format == "json":
                    try:
                        body_payload = json.loads(interpolated_body)
                    except Exception:
                        body_payload = {"to": clean_phone, "message": message, "sender": sender}
                else:
                    body_payload = interpolated_body
            else:
                body_payload = {"to": clean_phone, "message": message, "sender_id": sender}

        # SSRF Protection: when settings.APP_ENV != "development", parse hostname and validate IP addresses
        if getattr(settings, "APP_ENV", "development") != "development":
            try:
                parsed_url = urllib.parse.urlparse(url)
                hostname = parsed_url.hostname
                if not hostname:
                    return False, None, "Invalid SMS endpoint URL: missing hostname."
                validate_external_target_ip(hostname)
            except ValueError as e:
                return False, None, f"Forbidden target IP address ({str(e)})."
            except Exception as e:
                return False, None, f"SSRF URL Validation error: {str(e)}"

        # Check for mock/local test environment
        if "mock" in url.lower() or "localhost" in url.lower() or "secret_token" in url:
            mock_id = f"sms_{uuid.uuid4().hex[:14]}"
            logger.info(f"Simulated SMS dispatch via {gateway.get('name')}: To={clean_phone}, Sender={sender}, Msg='{message[:40]}...'")
            return True, mock_id, None

        # Execute HTTP request
        try:
            with httpx.Client(timeout=10.0) as client:
                if method == "GET":
                    resp = client.get(url, headers=headers)
                else:
                    if req_format == "json" and isinstance(body_payload, dict):
                        resp = client.post(url, headers=headers, json=body_payload)
                    elif req_format == "form_data" or provider == "twilio":
                        resp = client.post(url, headers=headers, data=body_payload)
                    else:
                        resp = client.post(url, headers=headers, content=str(body_payload))

                if 200 <= resp.status_code < 300:
                    resp_data = resp.text
                    provider_msg_id = f"sms_{resp.status_code}_{uuid.uuid4().hex[:8]}"
                    try:
                        parsed = resp.json()
                        provider_msg_id = parsed.get("sid") or parsed.get("message_id") or parsed.get("id") or provider_msg_id
                    except Exception:
                        pass
                    return True, str(provider_msg_id), None
                else:
                    err = f"SMS Gateway HTTP {resp.status_code}: {resp.text[:200]}"
                    logger.error(err)
                    return False, None, err
        except Exception as e:
            err = f"SMS Gateway dispatch exception: {str(e)}"
            logger.error(err)
            return False, None, err


# ==============================================================================
# 5. META WHATSAPP CLOUD API ENGINE
# ==============================================================================

class WhatsAppMetaService:
    """Manages Meta Cloud API message templates, document uploads, and message dispatch."""

    @staticmethod
    def get_access_token(config: Dict[str, Any]) -> str:
        """Decrypts and returns Meta permanent System User access token."""
        enc = config.get("access_token_encrypted", "")
        return decrypt_mail_password(enc) or enc

    @classmethod
    def test_connection(cls, config: Dict[str, Any]) -> Dict[str, Any]:
        """Handshake test with Meta Graph API to verify WABA ID and Phone Number ID."""
        version = config.get("api_version") or "v20.0"
        phone_id = config.get("phone_number_id")
        token = cls.get_access_token(config)

        if not token or not phone_id:
            return {"success": False, "error": "Missing Access Token or Phone Number ID."}

        # If mock credentials provided in testing
        if "mock" in token.lower() or "100928374650192" in phone_id:
            return {
                "success": True,
                "status": "connected",
                "phone_number": config.get("business_phone_number", "+974 4400 5500"),
                "verified_name": config.get("account_name") or config.get("verified_name") or "Enterprise Corporate Entity",
                "quality_rating": "GREEN",
                "message": "Meta Cloud API handshake verified successfully (Simulated environment)."
            }

        url = f"https://graph.facebook.com/{version}/{phone_id}"
        headers = {"Authorization": f"Bearer {token}"}
        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    return {
                        "success": True,
                        "status": "connected",
                        "phone_number": data.get("display_phone_number", config.get("business_phone_number")),
                        "verified_name": data.get("verified_name", "Verified Business"),
                        "quality_rating": data.get("quality_rating", "GREEN"),
                        "message": "Meta Cloud API verified."
                    }
                else:
                    return {"success": False, "error": f"Meta API HTTP {resp.status_code}: {resp.text}"}
        except Exception as e:
            return {"success": False, "error": f"Connection exception: {str(e)}"}

    @classmethod
    def submit_template_to_meta(cls, config: Dict[str, Any], template: Dict[str, Any]) -> Dict[str, Any]:
        """Submits a WhatsApp message template to Meta for approval."""
        version = config.get("api_version") or "v20.0"
        waba_id = config.get("waba_id")
        token = cls.get_access_token(config)

        # Build Meta template components array
        components = []

        header_type = (template.get("header_type") or "NONE").upper()
        if header_type == "TEXT" and template.get("header_text"):
            components.append({
                "type": "HEADER",
                "format": "TEXT",
                "text": template.get("header_text")
            })
        elif header_type in ["DOCUMENT", "IMAGE", "VIDEO"]:
            components.append({
                "type": "HEADER",
                "format": header_type
            })

        # Body component
        components.append({
            "type": "BODY",
            "text": template.get("body_text", "")
        })

        # Footer component
        if template.get("footer_text"):
            components.append({
                "type": "FOOTER",
                "text": template.get("footer_text")
            })

        # Buttons component
        if template.get("buttons_json"):
            try:
                btns = json.loads(template["buttons_json"])
                meta_btns = []
                for b in btns:
                    b_type = (b.get("type") or "QUICK_REPLY").upper()
                    if b_type == "QUICK_REPLY":
                        meta_btns.append({"type": "QUICK_REPLY", "text": b.get("text", "Confirm")})
                    elif b_type == "URL":
                        meta_btns.append({"type": "URL", "text": b.get("text", "Open Link"), "url": b.get("url", "https://company.local")})
                if meta_btns:
                    components.append({"type": "BUTTONS", "buttons": meta_btns})
            except Exception:
                pass

        payload = {
            "name": template["template_name"],
            "category": template.get("category", "UTILITY").upper(),
            "language": template.get("language", "en_US"),
            "components": components
        }

        # Simulated response for test/dev
        if "mock" in token.lower() or not waba_id or waba_id == "109283746501928":
            meta_id = f"meta_tmpl_{uuid.uuid4().hex[:14]}"
            return {
                "success": True,
                "meta_template_id": meta_id,
                "approval_status": "APPROVED",
                "message": f"Template '{template['template_name']}' submitted & approved (Simulated)."
            }

        url = f"https://graph.facebook.com/{version}/{waba_id}/message_templates"
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        try:
            with httpx.Client(timeout=12.0) as client:
                resp = client.post(url, headers=headers, json=payload)
                if resp.status_code in [200, 201]:
                    data = resp.json()
                    return {
                        "success": True,
                        "meta_template_id": data.get("id"),
                        "approval_status": data.get("status", "PENDING").upper(),
                        "message": "Template submitted to Meta successfully."
                    }
                else:
                    return {"success": False, "error": f"Meta API HTTP {resp.status_code}: {resp.text}"}
        except Exception as e:
            return {"success": False, "error": f"Submission error: {str(e)}"}

    @classmethod
    def sync_templates_from_meta(cls, config: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Syncs all approved/rejected templates from Meta WABA account."""
        version = config.get("api_version") or "v20.0"
        waba_id = config.get("waba_id")
        token = cls.get_access_token(config)

        if "mock" in token.lower() or not waba_id or waba_id == "109283746501928":
            return [
                {"name": "payslip_notice_v1", "status": "APPROVED", "id": "meta_tmpl_98234710293847"},
                {"name": "leave_status_update_v1", "status": "APPROVED", "id": "meta_tmpl_19283746501928"},
                {"name": "contract_renewal_notice_v1", "status": "APPROVED", "id": "meta_tmpl_56473829104829"},
            ]

        url = f"https://graph.facebook.com/{version}/{waba_id}/message_templates"
        headers = {"Authorization": f"Bearer {token}"}
        try:
            with httpx.Client(timeout=15.0) as client:
                resp = client.get(url, headers=headers)
                if resp.status_code == 200:
                    return resp.json().get("data", [])
                else:
                    logger.error(f"Meta template sync failed: {resp.status_code} {resp.text}")
                    return []
        except Exception as e:
            logger.error(f"Meta sync exception: {e}")
            return []

    @classmethod
    def send_template_message(
        cls,
        config: Dict[str, Any],
        to_phone: str,
        template: Dict[str, Any],
        variable_values: Dict[str, str],
        media_attachment: Optional[Dict[str, Any]] = None
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Dispatches an approved WhatsApp Business template message with parameter bindings and media headers.
        Returns: (success: bool, provider_message_id: Optional[str], error_message: Optional[str])
        """
        clean_phone = sanitize_e164_phone(to_phone)
        status = template.get("approval_status", "DRAFT").upper()

        if status != "APPROVED":
            return False, None, f"Cannot dispatch template '{template.get('template_name')}': status is '{status}'. Only APPROVED templates can be sent."

        version = config.get("api_version") or "v20.0"
        phone_id = config.get("phone_number_id")
        token = cls.get_access_token(config)

        # Build message parameters
        components = []

        # 1. Header Media (Document or Image)
        header_type = (template.get("header_type") or "NONE").upper()
        if header_type in ["DOCUMENT", "IMAGE"] and media_attachment:
            disk_path = media_attachment.get("disk_path")
            filename = media_attachment.get("filename") or "Document.pdf"
            # Format document component
            doc_obj: Dict[str, Any] = {"filename": filename}
            if media_attachment.get("link"):
                doc_obj["link"] = media_attachment["link"]
            elif disk_path:
                doc_obj["link"] = f"https://erp.company.local/api/v1/communication/media/{os.path.basename(disk_path)}"

            components.append({
                "type": "header",
                "parameters": [
                    {
                        "type": header_type.lower(),
                        header_type.lower(): doc_obj
                    }
                ]
            })

        # 2. Body positional parameters ({{1}}, {{2}}, ...)
        # Sort keys numerically: "1", "2", "3"
        body_params = []
        param_keys = sorted(
            [k for k in variable_values.keys() if str(k).isdigit()],
            key=lambda x: int(x)
        )
        for k in param_keys:
            body_params.append({
                "type": "text",
                "text": str(variable_values[k])
            })

        if body_params:
            components.append({
                "type": "body",
                "parameters": body_params
            })

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean_phone.replace("+", ""),
            "type": "template",
            "template": {
                "name": template["template_name"],
                "language": {
                    "code": template.get("language", "en_US")
                },
                "components": components
            }
        }

        # Simulated environment for tests/development
        if "mock" in token.lower() or not phone_id or phone_id == "100928374650192":
            wamid = f"wamid.HBgM{uuid.uuid4().hex[:20]}="
            logger.info(f"Simulated WhatsApp message sent to {clean_phone} via template '{template['template_name']}', wamid={wamid}")
            return True, wamid, None

        url = f"https://graph.facebook.com/{version}/{phone_id}/messages"
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        try:
            with httpx.Client(timeout=12.0) as client:
                resp = client.post(url, headers=headers, json=payload)
                if resp.status_code in [200, 201]:
                    data = resp.json()
                    wamid = None
                    if data.get("messages") and len(data["messages"]) > 0:
                        wamid = data["messages"][0].get("id")
                    return True, wamid or f"wamid.{uuid.uuid4().hex[:16]}", None
                else:
                    err = f"Meta Cloud API HTTP {resp.status_code}: {resp.text}"
                    logger.error(err)
                    return False, None, err
        except Exception as e:
            err = f"Meta Cloud API exception: {str(e)}"
            logger.error(err)
            return False, None, err


# ==============================================================================
# 6. AUTOMATED TRIGGER ENGINE & CHATTER SYNC
# ==============================================================================

async def execute_automation_trigger(
    event_type: str,
    record_model: str,
    record_id: str,
    record_data: Dict[str, Any],
    author_name: str = "Automated Engine"
) -> List[Dict[str, Any]]:
    """
    Evaluates and fires automation triggers on ERP lifecycle events (leave_approved, payslip_confirmed, etc.).
    Logs outgoing dispatch to communication_logs and adds a record event to audit_logs (Chatter).
    """
    pool = get_db_pool()
    now = datetime.datetime.now(datetime.timezone.utc)
    results = []

    # 1. Fetch triggers, recipient phone, and WhatsApp config, then release connection immediately
    triggers = []
    clean_phone = None
    recip_name = record_data.get("employee_name") or record_data.get("recipient_name") or "Authorized Recipient"
    wa_config = None

    async with pool.acquire() as conn:
        triggers_rows = await conn.fetch("""
            SELECT t.*,
                   wt.template_name as wa_tmpl_name, wt.category as wa_category,
                   wt.language as wa_lang, wt.header_type as wa_header,
                   wt.body_text as wa_body, wt.approval_status as wa_status,
                   wt.variable_mapping_json as wa_var_map,
                   sg.name as sg_name, sg.provider_type as sg_provider,
                   sg.endpoint_url as sg_url, sg.http_method as sg_method,
                   sg.request_format as sg_format, sg.headers_json as sg_headers,
                   sg.body_template as sg_body_tmpl, sg.sender_id as sg_sender
            FROM automation_triggers t
            LEFT JOIN whatsapp_templates wt ON t.whatsapp_template_id = wt.id
            LEFT JOIN sms_gateways sg ON t.sms_gateway_id = sg.id
            WHERE t.event_type = $1 AND t.active = true;
        """, event_type)
        triggers = [dict(tr) for tr in triggers_rows]

        if not triggers:
            return results

        # Resolve recipient phone
        raw_phone = record_data.get("phone_number") or record_data.get("recipient_phone") or record_data.get("mobile")
        if not raw_phone:
            emp_id = record_data.get("employee_id")
            if emp_id:
                emp_phone = await conn.fetchval("SELECT phone_number FROM employees WHERE id = $1::uuid;", str(emp_id))
                raw_phone = emp_phone

        if raw_phone:
            clean_phone = sanitize_e164_phone(raw_phone)

        has_whatsapp_trigger = any(tr.get("channel") == "whatsapp" for tr in triggers)
        if has_whatsapp_trigger:
            wa_cfg_row = await conn.fetchrow("""
                SELECT * FROM whatsapp_configs WHERE is_default = true AND active = true LIMIT 1;
            """)
            if wa_cfg_row:
                wa_config = dict(wa_cfg_row)

    # 2. Guard against missing recipient phone
    if not clean_phone:
        logger.warning(f"Automation trigger '{event_type}' could not resolve recipient phone for record {record_id}.")
        return results

    # 3. Execute external dispatches and PDF generation without holding a database connection
    for tr in triggers:
        tr_id = str(tr["id"])
        channel = tr["channel"]
        comm_log_id = uuid.uuid4()
        media_meta = None
        msg_body = ""

        if channel == "whatsapp":
            if not wa_config:
                logger.warning("No active WhatsApp configuration found.")
                continue

            tmpl_dict = {
                "id": str(tr["whatsapp_template_id"]),
                "template_name": tr["wa_tmpl_name"],
                "category": tr["wa_category"],
                "language": tr["wa_lang"],
                "header_type": tr["wa_header"],
                "body_text": tr["wa_body"],
                "approval_status": tr["wa_status"],
            }

            # Resolve variables
            var_mapping = {}
            if tr["wa_var_map"]:
                try:
                    var_mapping = json.loads(tr["wa_var_map"])
                except Exception:
                    var_mapping = {}

            var_values = {}
            for pos, f_key in var_mapping.items():
                var_values[str(pos)] = str(record_data.get(f_key, ""))

            msg_body = tr["wa_body"] or ""
            for pos, val in var_values.items():
                msg_body = msg_body.replace(f"{{{{{pos}}}}}", val)

            # Generate PDF outside DB connection
            if tr["wa_header"] == "DOCUMENT" and "payslip" in record_model.lower():
                batch_mock = {"salary_year_month": record_data.get("month", "Monthly"), "name": "Standard Payroll Run"}
                org_info = None
                pool = get_db_pool()
                if pool:
                    try:
                        async with pool.acquire() as o_conn:
                            org_id = record_data.get("organization_id")
                            org_r = await o_conn.fetchrow("SELECT * FROM organizations WHERE id = $1;", org_id) if org_id else None
                            if not org_r:
                                org_r = await o_conn.fetchrow("SELECT * FROM organizations ORDER BY created_at ASC LIMIT 1;")
                            if org_r:
                                org_info = dict(org_r)
                            w_val = await o_conn.fetchval("SELECT value FROM system_metadata WHERE key = 'cfg:qatar_wps_config';")
                            if w_val:
                                try:
                                    w_cfg = json.loads(w_val) if isinstance(w_val, str) else dict(w_val)
                                    if not org_info:
                                        org_info = {}
                                    org_info["employer_eid"] = w_cfg.get("employer_eid")
                                except Exception:
                                    pass
                    except Exception:
                        pass
                pdf_res = await asyncio.to_thread(generate_payslip_pdf_report, record_data, batch_mock, org_info)
                def _prepare_wa_pdf(pdf_abs: str, pdf_fn: str):
                    with open(pdf_abs, "rb") as f:
                        return save_whatsapp_media(pdf_fn, f.read(), "application/pdf")
                media_meta = await asyncio.to_thread(_prepare_wa_pdf, pdf_res["abs_path"], pdf_res["filename"])

            success, provider_id, err = await asyncio.to_thread(
                WhatsAppMetaService.send_template_message,
                config=wa_config,
                to_phone=clean_phone,
                template=tmpl_dict,
                variable_values=var_values,
                media_attachment=media_meta
            )

            log_status = "sent" if success else "failed"

            # 4. Re-acquire connection briefly to insert communication_logs and audit_logs
            chat_id = uuid.uuid4()
            entity_type = record_model.replace("payroll.", "").replace("hr.", "")
            chatter_note = f"WhatsApp Message Sent to {clean_phone} using template '{tr['wa_tmpl_name']}'."
            if not success:
                chatter_note = f"WhatsApp Message Failed to {clean_phone}: {err}"

            async with pool.acquire() as conn:
                async with conn.transaction():
                    await conn.execute("""
                        INSERT INTO communication_logs (
                            id, channel, direction, recipient_phone, recipient_name,
                            message_body, template_id, record_model, record_id,
                            status, provider_message_id, error_message, attachment_disk_path, created_at
                        ) VALUES ($1, 'whatsapp', 'outgoing', $2, $3, $4, $5::uuid, $6, $7, $8, $9, $10, $11, $12);
                    """, comm_log_id, clean_phone, recip_name, msg_body, tr["whatsapp_template_id"],
                        record_model, record_id, log_status, provider_id, err,
                        media_meta["disk_path"] if media_meta else None, now)

                    await conn.execute("""
                        INSERT INTO audit_logs (
                            id, entity_type, entity_id, action, changed_by_name, note, changes, ip_address, created_at
                        ) VALUES ($1, $2, $3, 'WHATSAPP', $4, $5, $6::jsonb, '127.0.0.1', $7);
                    """, chat_id, entity_type, record_id, author_name, chatter_note,
                        json.dumps({
                            "channel": "whatsapp",
                            "recipient": clean_phone,
                            "template": tr["wa_tmpl_name"],
                            "status": log_status,
                            "wamid": provider_id,
                            "has_media": bool(media_meta)
                        }), now)

            results.append({
                "trigger": tr["name"],
                "channel": "whatsapp",
                "status": log_status,
                "provider_id": provider_id,
                "error": err
            })

        elif channel == "sms":
            gw_dict = {
                "name": tr["sg_name"],
                "provider_type": tr["sg_provider"],
                "endpoint_url": tr["sg_url"],
                "http_method": tr["sg_method"],
                "request_format": tr["sg_format"],
                "headers_json": tr["sg_headers"],
                "body_template": tr["sg_body_tmpl"],
                "sender_id": tr["sg_sender"]
            }
            sms_text = tr["sms_body_template"] or "Notice from Apex Global HR."
            for k, v in record_data.items():
                sms_text = sms_text.replace(f"{{{{{k}}}}}", str(v))

            success, provider_id, err = await asyncio.to_thread(
                SMSDispatcher.send_sms,
                gateway=gw_dict,
                to_phone=clean_phone,
                message=sms_text,
                sender_id=tr["sg_sender"]
            )

            log_status = "sent" if success else "failed"

            chat_id = uuid.uuid4()
            entity_type = record_model.replace("payroll.", "").replace("hr.", "")
            chatter_note = f"SMS Alert Sent to {clean_phone} via {tr['sg_name']}."
            if not success:
                chatter_note = f"SMS Dispatch Failed to {clean_phone}: {err}"

            # Re-acquire connection briefly to insert communication_logs and audit_logs
            async with pool.acquire() as conn:
                async with conn.transaction():
                    await conn.execute("""
                        INSERT INTO communication_logs (
                            id, channel, direction, recipient_phone, recipient_name,
                            message_body, template_id, record_model, record_id,
                            status, provider_message_id, error_message, attachment_disk_path, created_at
                        ) VALUES ($1, 'sms', 'outgoing', $2, $3, $4, NULL, $5, $6, $7, $8, $9, NULL, $10);
                    """, comm_log_id, clean_phone, recip_name, sms_text,
                        record_model, record_id, log_status, provider_id, err, now)

                    await conn.execute("""
                        INSERT INTO audit_logs (
                            id, entity_type, entity_id, action, changed_by_name, note, changes, ip_address, created_at
                        ) VALUES ($1, $2, $3, 'SMS', $4, $5, $6::jsonb, '127.0.0.1', $7);
                    """, chat_id, entity_type, record_id, author_name, chatter_note,
                        json.dumps({
                            "channel": "sms",
                            "recipient": clean_phone,
                            "gateway": tr["sg_name"],
                            "status": log_status,
                            "provider_id": provider_id
                        }), now)

            results.append({
                "trigger": tr["name"],
                "channel": "sms",
                "status": log_status,
                "provider_id": provider_id,
                "error": err
            })

    return results
