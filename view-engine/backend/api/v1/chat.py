import os
import uuid
import json
import datetime
import logging
import mimetypes
import re
from urllib.parse import unquote, quote
from typing import Optional, Dict, Any, List
from fastapi import (
    APIRouter, HTTPException, status, Request, Depends, Query,
    UploadFile, File, WebSocket, WebSocketDisconnect, Header
)
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.core.database import get_db_pool
from backend.core.dependencies import get_current_user_session, get_client_ip
from backend.core.session import SessionManager
from backend.core.chat_engine import (
    VapidKeyManager,
    ws_manager,
    chat_ws_manager,
    ChatConnectionManager,
    save_chat_attachment,
    dispatch_web_push,
    slugify_name,
    extract_mentions,
    can_broadcast_mention,
    can_post_in_channel,
    provision_department_channel,
    handle_employee_department_sync
)

logger = logging.getLogger("enterprise.chat_api")


def normalize_attachment_obj(att: Any) -> Dict[str, Any]:
    """Ensure every chat attachment has uniform fields including file_url, url, disk_path, size, and mime_type."""
    if not isinstance(att, dict):
        return att
    disk_path = att.get("disk_path") or att.get("path") or ""
    disk_path_clean = str(disk_path).replace("\\", "/")
    name = att.get("name") or att.get("filename") or att.get("file_name") or os.path.basename(disk_path_clean) or "Attachment"
    
    file_url = att.get("file_url") or att.get("url")
    if not file_url and disk_path_clean:
        file_url = f"/api/v1/chat/attachments/{disk_path_clean}"

    size_val = att.get("size") or att.get("file_size_bytes") or 0
    mime_val = att.get("mime_type")
    if not mime_val:
        guessed_mime, _ = mimetypes.guess_type(name)
        mime_val = guessed_mime or "application/octet-stream"

    return {
        "id": att.get("id") or uuid.uuid4().hex[:12],
        "name": name,
        "filename": name,
        "file_name": name,
        "disk_path": disk_path_clean,
        "file_url": file_url,
        "url": file_url,
        "size": size_val,
        "file_size_bytes": size_val,
        "mime_type": mime_val
    }

router = APIRouter(prefix="/api/v1/chat", tags=["Internal Real-Time Chat & Channels"])
push_router = APIRouter(prefix="/api/v1/push", tags=["W3C Web Push Notifications (VAPID)"])


# ==============================================================================
# PYDANTIC SCHEMAS
# ==============================================================================

class PushSubscriptionCreate(BaseModel):
    endpoint: str
    p256dh_key: str
    auth_key: str
    user_agent: Optional[str] = None


class PushUnsubscribe(BaseModel):
    endpoint: str


class CreateChannelRequest(BaseModel):
    channel_type: str = "public_group"  # direct, department_auto, public_group, private_group, record_discussion
    name: Optional[str] = None
    channel_slug: Optional[str] = None
    description: Optional[str] = None
    is_announcement_only: bool = False
    department_id: Optional[str] = None
    target_user_id: Optional[str] = None  # for direct chats
    record_model: Optional[str] = None
    record_id: Optional[str] = None
    member_user_ids: Optional[List[str]] = None


class SendMessageRequest(BaseModel):
    message_text: str
    attachments_json: Optional[str] = None  # JSON array string or None
    reply_to_message_id: Optional[str] = None
    mentions_json: Optional[str] = None


# ==============================================================================
# 1. W3C WEB PUSH VAPID ENDPOINTS
# ==============================================================================

@push_router.get("/vapid-public-key")
async def get_vapid_public_key():
    """Return the application VAPID public key (uncompressed point base64url)."""
    pub_key = VapidKeyManager.get_public_key()
    return {"public_key": pub_key}


@push_router.post("/subscribe")
async def subscribe_push_notifications(
    payload: PushSubscriptionCreate,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Register or refresh client push subscription."""
    pool = get_db_pool()
    user_id = uuid.UUID(str(session.get("id") or session.get("user_id")))

    async with pool.acquire() as conn:
        sub_id = uuid.uuid4()
        await conn.execute("""
            INSERT INTO web_push_subscriptions (
                id, user_id, endpoint, p256dh_key, auth_key, user_agent, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
            ON CONFLICT (endpoint) DO UPDATE SET
                user_id = EXCLUDED.user_id,
                p256dh_key = EXCLUDED.p256dh_key,
                auth_key = EXCLUDED.auth_key,
                user_agent = EXCLUDED.user_agent;
        """, sub_id, user_id, payload.endpoint, payload.p256dh_key, payload.auth_key, payload.user_agent)

    return {"status": "subscribed", "message": "Push notifications subscribed successfully."}


@push_router.post("/unsubscribe")
async def unsubscribe_push_notifications(
    payload: PushUnsubscribe,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Remove push subscription for client endpoint."""
    pool = get_db_pool()
    user_id = uuid.UUID(str(session.get("id") or session.get("user_id")))

    async with pool.acquire() as conn:
        await conn.execute("""
            DELETE FROM web_push_subscriptions
            WHERE endpoint = $1 AND user_id = $2;
        """, payload.endpoint, user_id)

    return {"status": "unsubscribed", "message": "Push subscription removed."}


@push_router.post("/test")
async def send_test_push_notification(
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Send a test push notification to verify the end-to-end VAPID pipeline."""
    user_id = str(session.get("id") or session.get("user_id"))
    user_name = session.get("full_name") or session.get("username") or "User"

    await dispatch_web_push(
        user_id=user_id,
        title="Apex ERP • Push Verified",
        body=f"Hello {user_name}! Web Push and Desktop Notifications are active.",
        url="/chat"
    )

    return {"status": "queued", "message": "Test push notification dispatched."}


# ==============================================================================
# 2. INTERNAL CHAT & CHANNELS REST API
# ==============================================================================

@router.get("/unread-count")
async def get_total_unread_chat_count(
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Get total unread messages count for top-bar badge."""
    pool = get_db_pool()
    user_id = uuid.UUID(str(session.get("id") or session.get("user_id")))

    async with pool.acquire() as conn:
        total = await conn.fetchval("""
            SELECT COUNT(m.id)
            FROM chat_channel_members mem
            JOIN chat_messages m ON m.channel_id = mem.channel_id
            WHERE mem.user_id = $1
              AND mem.is_muted = false
              AND m.sender_id != $1
              AND m.created_at > mem.last_read_at;
        """, user_id)

    return {"total_unread": total or 0}


@router.get("/users")
async def list_available_chat_users(
    q: Optional[str] = Query(None),
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """List directory of users available for 1-on-1 direct messaging."""
    pool = get_db_pool()
    current_uid = uuid.UUID(str(session.get("id") or session.get("user_id")))

    search_query = f"%{q.strip()}%" if q and q.strip() else None

    async with pool.acquire() as conn:
        if search_query:
            rows = await conn.fetch("""
                SELECT u.id, split_part(u.email, '@', 1) as username, u.full_name, u.email, u.role_id as role,
                       e.job_title, e.department_id, e.employee_number
                FROM users u
                LEFT JOIN employees e ON (u.email = e.work_email)
                WHERE u.id != $1 AND u.status = 'active'
                  AND (u.full_name ILIKE $2 OR u.email ILIKE $2 OR e.job_title ILIKE $2)
                ORDER BY u.full_name ASC
                LIMIT 30;
            """, current_uid, search_query)
        else:
            rows = await conn.fetch("""
                SELECT u.id, split_part(u.email, '@', 1) as username, u.full_name, u.email, u.role_id as role,
                       e.job_title, e.department_id, e.employee_number
                FROM users u
                LEFT JOIN employees e ON (u.email = e.work_email)
                WHERE u.id != $1 AND u.status = 'active'
                ORDER BY u.full_name ASC
                LIMIT 50;
            """, current_uid)

    res = []
    for r in rows:
        uid_str = str(r["id"])
        res.append({
            "id": uid_str,
            "username": r["username"],
            "full_name": r["full_name"],
            "email": r["email"],
            "role": r["role"],
            "job_title": r["job_title"] or "Staff Member",
            "department": r["department_id"] or "Operations",
            "employee_number": r["employee_number"],
            "is_online": ws_manager.is_user_online(uid_str)
        })

    return {"users": res}


@router.get("/channels")
async def list_user_channels(
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """List all active chat channels for the authenticated user, enriched with metadata and unread counts."""
    pool = get_db_pool()
    current_uid = uuid.UUID(str(session.get("id") or session.get("user_id")))

    is_admin = session.get("is_superadmin") or session.get("role_id") in ("admin", "superadmin", "manager")
    perms = session.get("permissions") or {}
    has_manager_perm = is_admin or perms.get("hr.manage") or perms.get("admin") or perms.get("all")

    async with pool.acquire() as conn:
        channel_rows = await conn.fetch("""
            SELECT c.id, c.name, c.channel_slug, c.channel_type, c.department_id, c.description,
                   c.is_announcement_only, c.record_model, c.record_id, c.created_at,
                   mem.role, mem.is_auto_assigned, mem.last_read_at, mem.is_muted,
                   (SELECT COUNT(*) FROM chat_channel_members m WHERE m.channel_id = c.id) as member_count
            FROM chat_channel_members mem
            JOIN chat_channels c ON c.id = mem.channel_id
            WHERE mem.user_id = $1
            ORDER BY c.created_at DESC;
        """, current_uid)

        if not channel_rows:
            return {"channels": []}

        ch_ids = [ch["id"] for ch in channel_rows]
        direct_ch_ids = [ch["id"] for ch in channel_rows if ch["channel_type"] == "direct"]

        # Batch 1: Unread messages count per channel (1 grouped query)
        unread_rows = await conn.fetch("""
            SELECT m.channel_id, COUNT(m.id) as unread_count
            FROM chat_channel_members mem
            JOIN chat_messages m ON m.channel_id = mem.channel_id
            WHERE mem.user_id = $2
              AND m.channel_id = ANY($1::uuid[])
              AND (m.sender_id IS NULL OR m.sender_id != $2)
              AND (mem.last_read_at IS NULL OR m.created_at > mem.last_read_at)
            GROUP BY m.channel_id;
        """, ch_ids, current_uid)
        unread_map = {r["channel_id"]: int(r["unread_count"]) for r in unread_rows}

        # Batch 2: Latest message per channel (1 DISTINCT ON query)
        last_msg_rows = await conn.fetch("""
            SELECT DISTINCT ON (m.channel_id)
                   m.channel_id, m.id, m.message_text, m.created_at, m.sender_id, m.is_system_event,
                   u.full_name as sender_name
            FROM chat_messages m
            LEFT JOIN users u ON u.id = m.sender_id
            WHERE m.channel_id = ANY($1::uuid[])
            ORDER BY m.channel_id, m.created_at DESC;
        """, ch_ids)
        latest_msgs = {}
        for r in last_msg_rows:
            latest_msgs[r["channel_id"]] = {
                "id": str(r["id"]),
                "text": r["message_text"],
                "sender_id": str(r["sender_id"]) if r["sender_id"] else None,
                "sender_name": r["sender_name"] or ("System" if r["is_system_event"] else "Colleague"),
                "created_at": r["created_at"].isoformat()
            }

        # Batch 3: Other member details for 1-on-1 direct channels (1 query)
        direct_members = {}
        if direct_ch_ids:
            other_rows = await conn.fetch("""
                SELECT mem.channel_id, u.id, split_part(u.email, '@', 1) as username, u.full_name, u.email
                FROM chat_channel_members mem
                JOIN users u ON u.id = mem.user_id
                WHERE mem.channel_id = ANY($1::uuid[]) AND mem.user_id != $2;
            """, direct_ch_ids, current_uid)
            for r in other_rows:
                ou_id_str = str(r["id"])
                direct_members[r["channel_id"]] = {
                    "other_user": {
                        "id": ou_id_str,
                        "username": r["username"],
                        "full_name": r["full_name"],
                        "email": r["email"],
                        "is_online": ws_manager.is_user_online(ou_id_str)
                    },
                    "display_name": r["full_name"] or r["username"]
                }

        channels = []
        for ch in channel_rows:
            ch_id = ch["id"]
            ch_type = ch["channel_type"]
            last_read = ch["last_read_at"]
            is_announcement = bool(ch["is_announcement_only"])
            user_role = ch["role"] or "member"

            can_post = True
            if is_announcement:
                can_post = bool(has_manager_perm or user_role in ("admin", "moderator"))

            unread_cnt = unread_map.get(ch_id, 0)
            last_msg = latest_msgs.get(ch_id)

            other_user = None
            display_name = ch["name"]

            if ch_type == "direct" and ch_id in direct_members:
                other_user = direct_members[ch_id]["other_user"]
                display_name = direct_members[ch_id]["display_name"]

            channels.append({
                "id": str(ch["id"]),
                "name": display_name,
                "channel_slug": ch["channel_slug"] or slugify_name(display_name or "channel"),
                "channel_type": ch_type,
                "department_id": str(ch["department_id"]) if ch["department_id"] else None,
                "description": ch["description"],
                "is_announcement_only": is_announcement,
                "role": user_role,
                "can_post": can_post,
                "member_count": int(ch["member_count"] or 1),
                "record_model": ch["record_model"],
                "record_id": ch["record_id"],
                "created_at": ch["created_at"].isoformat(),
                "last_read_at": last_read.isoformat() if last_read else None,
                "is_muted": ch["is_muted"],
                "unread_count": unread_cnt,
                "last_message": last_msg,
                "other_user": other_user
            })

    channels.sort(
        key=lambda x: (x["last_message"]["created_at"] if x["last_message"] else x["created_at"]),
        reverse=True
    )

    return {"channels": channels}


@router.post("/channels")
async def create_or_get_channel(
    payload: CreateChannelRequest,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Create custom group channels (public/private), get or create 1-on-1 direct channels,
    or provision department channels with initial members.
    """
    pool = get_db_pool()
    current_uid = uuid.UUID(str(session.get("id") or session.get("user_id")))

    async with pool.acquire() as conn:
        if payload.channel_type == "direct":
            if not payload.target_user_id:
                raise HTTPException(status_code=400, detail="target_user_id is required for direct chats.")

            target_uid = uuid.UUID(str(payload.target_user_id))

            existing_channel = await conn.fetchval("""
                SELECT c.id
                FROM chat_channels c
                JOIN chat_channel_members m1 ON m1.channel_id = c.id AND m1.user_id = $1
                JOIN chat_channel_members m2 ON m2.channel_id = c.id AND m2.user_id = $2
                WHERE c.channel_type = 'direct'
                LIMIT 1;
            """, current_uid, target_uid)

            if existing_channel:
                target_user = await conn.fetchrow("SELECT id, split_part(email, '@', 1) as username, full_name, email FROM users WHERE id = $1;", target_uid)
                return {
                    "id": str(existing_channel),
                    "channel_type": "direct",
                    "channel_slug": f"dm-{target_uid.hex[:8]}",
                    "name": target_user["full_name"] if target_user else "Direct Chat",
                    "member_count": 2,
                    "is_announcement_only": False,
                    "can_post": True,
                    "other_user": {
                        "id": str(target_user["id"]),
                        "username": target_user["username"],
                        "full_name": target_user["full_name"],
                        "email": target_user["email"],
                        "is_online": ws_manager.is_user_online(str(target_user["id"]))
                    } if target_user else None
                }

            new_id = uuid.uuid4()
            dm_slug = f"dm-{uuid.uuid4().hex[:8]}"
            await conn.execute("""
                INSERT INTO chat_channels (id, name, channel_slug, channel_type, is_announcement_only, created_by)
                VALUES ($1, NULL, $2, 'direct', false, $3);
            """, new_id, dm_slug, current_uid)

            await conn.execute("""
                INSERT INTO chat_channel_members (id, channel_id, user_id, role, joined_at)
                VALUES ($1, $2, $3, 'member', CURRENT_TIMESTAMP), ($4, $2, $5, 'member', CURRENT_TIMESTAMP);
            """, uuid.uuid4(), new_id, current_uid, uuid.uuid4(), target_uid)

            await ws_manager.subscribe_user_to_channel(str(current_uid), str(new_id))
            await ws_manager.subscribe_user_to_channel(str(target_uid), str(new_id))

            for member_uid in (current_uid, target_uid):
                await ws_manager.send_to_user(str(member_uid), {"type": "CHANNEL_CREATED", "channel_id": str(new_id)})

            target_user = await conn.fetchrow("SELECT id, split_part(email, '@', 1) as username, full_name, email FROM users WHERE id = $1;", target_uid)

            return {
                "id": str(new_id),
                "channel_type": "direct",
                "channel_slug": dm_slug,
                "name": target_user["full_name"] if target_user else "Direct Chat",
                "member_count": 2,
                "is_announcement_only": False,
                "can_post": True,
                "other_user": {
                    "id": str(target_user["id"]),
                    "username": target_user["username"],
                    "full_name": target_user["full_name"],
                    "email": target_user["email"],
                    "is_online": ws_manager.is_user_online(str(target_user["id"]))
                } if target_user else None
            }

        else:
            # Custom group channels (public_group, private_group, department_auto, record_discussion)
            new_id = uuid.uuid4()
            raw_name = (payload.name or "New Channel").strip()
            slug = payload.channel_slug.strip() if payload.channel_slug and payload.channel_slug.strip() else slugify_name(raw_name)

            # Ensure unique slug
            existing_slug = await conn.fetchval("SELECT id FROM chat_channels WHERE channel_slug = $1;", slug)
            if existing_slug:
                slug = f"{slug}-{uuid.uuid4().hex[:4]}"

            dept_uuid = uuid.UUID(payload.department_id) if payload.department_id else None
            ch_type = payload.channel_type or "public_group"
            if ch_type not in ("public_group", "private_group", "department_auto", "record_discussion", "group"):
                ch_type = "public_group"

            await conn.execute("""
                INSERT INTO chat_channels (
                    id, name, channel_slug, channel_type, department_id, description, is_announcement_only,
                    record_model, record_id, created_by, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
            """, new_id, raw_name, slug, ch_type, dept_uuid, payload.description, payload.is_announcement_only,
                payload.record_model, payload.record_id, current_uid)

            # Add creator as admin
            await conn.execute("""
                INSERT INTO chat_channel_members (id, channel_id, user_id, role, is_auto_assigned, joined_at)
                VALUES ($1, $2, $3, 'admin', false, CURRENT_TIMESTAMP);
            """, uuid.uuid4(), new_id, current_uid)

            await ws_manager.subscribe_user_to_channel(str(current_uid), str(new_id))

            # Add invited members
            member_count = 1
            all_members = [current_uid]
            if payload.member_user_ids:
                for m_id in payload.member_user_ids:
                    try:
                        parsed_m = uuid.UUID(str(m_id))
                        if parsed_m != current_uid:
                            await conn.execute("""
                                INSERT INTO chat_channel_members (id, channel_id, user_id, role, is_auto_assigned, joined_at)
                                VALUES ($1, $2, $3, 'member', false, CURRENT_TIMESTAMP)
                                ON CONFLICT (channel_id, user_id) DO NOTHING;
                            """, uuid.uuid4(), new_id, parsed_m)
                            await ws_manager.subscribe_user_to_channel(str(parsed_m), str(new_id))
                            all_members.append(parsed_m)
                            member_count += 1
                    except ValueError:
                        pass

            for member_uid in all_members:
                await ws_manager.send_to_user(str(member_uid), {"type": "CHANNEL_CREATED", "channel_id": str(new_id)})

            # Initial welcome post
            now = datetime.datetime.now(datetime.timezone.utc)
            creator_name = session.get("full_name") or "Channel admin"
            ann_note = " (Announcement channel — moderators post)" if payload.is_announcement_only else ""
            welcome_text = f"Channel #{slug} created by {creator_name}.{ann_note}"
            await conn.execute("""
                INSERT INTO chat_messages (id, channel_id, sender_id, message_text, is_system_event, created_at)
                VALUES ($1, $2, NULL, $3, true, $4);
            """, uuid.uuid4(), new_id, welcome_text, now)

            return {
                "id": str(new_id),
                "name": raw_name,
                "channel_slug": slug,
                "channel_type": ch_type,
                "department_id": str(dept_uuid) if dept_uuid else None,
                "description": payload.description,
                "is_announcement_only": payload.is_announcement_only,
                "role": "admin",
                "can_post": True,
                "member_count": member_count,
                "record_model": payload.record_model,
                "record_id": payload.record_id
            }


@router.get("/channels/{channel_id}/members")
async def list_channel_members(
    channel_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Retrieve all members of a channel with online presence and roles."""
    pool = get_db_pool()
    ch_uuid = uuid.UUID(str(channel_id))

    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT mem.id, mem.role, mem.is_auto_assigned, mem.joined_at,
                   u.id as user_id, u.full_name, split_part(u.email, '@', 1) as username, u.email,
                   e.job_title, e.department_id
            FROM chat_channel_members mem
            JOIN users u ON u.id = mem.user_id
            LEFT JOIN employees e ON (LOWER(u.email) = LOWER(e.work_email))
            WHERE mem.channel_id = $1
            ORDER BY mem.role = 'admin' DESC, mem.role = 'moderator' DESC, u.full_name ASC;
        """, ch_uuid)

        members = []
        for r in rows:
            uid_str = str(r["user_id"])
            members.append({
                "id": str(r["id"]),
                "user_id": uid_str,
                "full_name": r["full_name"],
                "username": r["username"],
                "email": r["email"],
                "role": r["role"] or "member",
                "is_auto_assigned": r["is_auto_assigned"],
                "job_title": r["job_title"] or "Staff Member",
                "department": r["department_id"] or "General",
                "is_online": ws_manager.is_user_online(uid_str)
            })

    return {"members": members, "count": len(members)}


@router.get("/departments")
async def list_available_departments(
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """List all registered departments for channel grouping and filtering."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, name, code, description FROM departments ORDER BY name ASC;")
    return {"departments": [{"id": str(r["id"]), "name": r["name"], "code": r["code"], "description": r["description"]} for r in rows]}


@router.get("/channels/{channel_id}/messages")
async def get_channel_messages(
    channel_id: str,
    limit: int = Query(50, ge=1, le=200),
    before_id: Optional[str] = Query(None),
    offset: int = Query(0, ge=0),
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Retrieve message history for a channel with infinite scroll and pagination support."""
    pool = get_db_pool()
    current_uid = uuid.UUID(str(session.get("id") or session.get("user_id")))
    ch_uuid = uuid.UUID(str(channel_id))

    async with pool.acquire() as conn:
        # Check membership
        is_member = await conn.fetchval("""
            SELECT id FROM chat_channel_members
            WHERE channel_id = $1 AND user_id = $2;
        """, ch_uuid, current_uid)
        if not is_member:
            raise HTTPException(status_code=403, detail="You are not a member of this channel.")

        if before_id:
            before_uuid = uuid.UUID(str(before_id))
            rows = await conn.fetch("""
                SELECT * FROM (
                    SELECT m.id, m.channel_id, m.sender_id, m.message_text, m.attachments_json,
                           m.is_system_event, m.created_at,
                           split_part(u.email, '@', 1) as sender_username, u.full_name as sender_name, u.email as sender_email
                    FROM chat_messages m
                    LEFT JOIN users u ON u.id = m.sender_id
                    WHERE m.channel_id = $1
                      AND m.created_at < (SELECT created_at FROM chat_messages WHERE id = $2)
                    ORDER BY m.created_at DESC
                    LIMIT $3
                ) sub
                ORDER BY sub.created_at ASC;
            """, ch_uuid, before_uuid, limit)
        else:
            rows = await conn.fetch("""
                SELECT * FROM (
                    SELECT m.id, m.channel_id, m.sender_id, m.message_text, m.attachments_json,
                           m.is_system_event, m.created_at,
                           split_part(u.email, '@', 1) as sender_username, u.full_name as sender_name, u.email as sender_email
                    FROM chat_messages m
                    LEFT JOIN users u ON u.id = m.sender_id
                    WHERE m.channel_id = $1
                    ORDER BY m.created_at DESC
                    LIMIT $2 OFFSET $3
                ) sub
                ORDER BY sub.created_at ASC;
            """, ch_uuid, limit, offset)

        current_user_id = str(session.get("id") or session.get("user_id") or "").lower()
        current_user_email = str(session.get("email") or session.get("username") or "").lower()

        messages = []
        for r in rows:
            attachments = []
            if r["attachments_json"]:
                try:
                    raw_atts = json.loads(r["attachments_json"])
                    if isinstance(raw_atts, list):
                        attachments = [normalize_attachment_obj(a) for a in raw_atts if isinstance(a, dict)]
                except Exception:
                    attachments = []

            msg_sender_id = str(r["sender_id"] or "").lower()
            msg_sender_email = str(r["sender_email"] or "").lower() if r["sender_email"] else ""
            is_me = (msg_sender_id == str(current_uid).lower()) or (bool(current_user_email and msg_sender_email == current_user_email))

            raw_text = r["message_text"] or ""
            messages.append({
                "id": str(r["id"]),
                "channel_id": str(r["channel_id"]),
                "channelId": str(r["channel_id"]),
                "sender_id": str(r["sender_id"]) if r["sender_id"] else None,
                "senderId": str(r["sender_id"]) if r["sender_id"] else None,
                "sender_name": r["sender_name"] or r["sender_username"] or "System",
                "senderName": r["sender_name"] or r["sender_username"] or "System",
                "sender_email": r["sender_email"],
                "content": raw_text,
                "text": raw_text,
                "message": raw_text,
                "message_text": raw_text,
                "attachments": attachments,
                "is_system_event": r["is_system_event"],
                "is_me": is_me,
                "created_at": r["created_at"].isoformat(),
                "createdAt": r["created_at"].isoformat()
            })

        has_more = False
        if rows:
            earliest_time = rows[0]["created_at"]
            older_count = await conn.fetchval("""
                SELECT COUNT(*) FROM chat_messages
                WHERE channel_id = $1 AND created_at < $2;
            """, ch_uuid, earliest_time)
            has_more = bool(older_count and older_count > 0)

    return {
        "messages": messages,
        "has_more": has_more,
        "hasMore": has_more
    }


@router.post("/channels/{channel_id}/messages")
async def send_channel_message(
    channel_id: str,
    payload: SendMessageRequest,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Send a message to a channel via REST and broadcast to active room WebSockets / Web Push.
    Validates is_announcement_only posting permissions and handles @channel / @all broadcast mentions.
    """
    pool = get_db_pool()
    current_uid = uuid.UUID(str(session.get("id") or session.get("user_id")))
    ch_uuid = uuid.UUID(str(channel_id))
    sender_name = session.get("full_name") or session.get("username") or "User"

    if not payload.message_text.strip() and not payload.attachments_json:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    msg_id = uuid.uuid4()
    now = datetime.datetime.now(datetime.timezone.utc)
    reply_uuid = uuid.UUID(payload.reply_to_message_id) if payload.reply_to_message_id else None

    async with pool.acquire() as conn:
        channel = await conn.fetchrow("""
            SELECT id, name, channel_slug, channel_type, is_announcement_only
            FROM chat_channels
            WHERE id = $1;
        """, ch_uuid)
        if not channel:
            raise HTTPException(status_code=404, detail="Channel not found.")

        # Check membership
        is_member = await conn.fetchval("""
            SELECT id FROM chat_channel_members
            WHERE channel_id = $1 AND user_id = $2;
        """, ch_uuid, current_uid)

        if not is_member:
            # Auto-join if public group
            if channel["channel_type"] == "public_group":
                await conn.execute("""
                    INSERT INTO chat_channel_members (id, channel_id, user_id, role, is_auto_assigned, joined_at)
                    VALUES ($1, $2, $3, 'member', false, CURRENT_TIMESTAMP)
                    ON CONFLICT (channel_id, user_id) DO NOTHING;
                """, uuid.uuid4(), ch_uuid, current_uid)
                await ws_manager.subscribe_user_to_channel(str(current_uid), str(ch_uuid))
            else:
                raise HTTPException(status_code=403, detail="You are not a member of this channel.")

        # Validate announcement-only channel permissions
        can_post = await can_post_in_channel(
            conn=conn,
            user_id=current_uid,
            channel_id=ch_uuid,
            is_announcement_only=bool(channel["is_announcement_only"]),
            session=session
        )
        if not can_post:
            raise HTTPException(
                status_code=403,
                detail="This channel is announcement-only. Only managers, administrators, and moderators can post messages."
            )

        # Detect mentions
        mentions = extract_mentions(payload.message_text)
        force_push_all = False
        if "@channel" in mentions or "@all" in mentions:
            is_auth_broadcast = await can_broadcast_mention(
                conn=conn,
                user_id=current_uid,
                channel_id=ch_uuid,
                session=session
            )
            if is_auth_broadcast:
                force_push_all = True
            else:
                # Regular user attempted broadcast mention without manager/admin privileges
                logger.info(f"User {current_uid} typed broadcast mention in #{channel['channel_slug']} without authorization.")

        mentions_json = json.dumps(mentions) if mentions else payload.mentions_json

        att_list = []
        if payload.attachments_json:
            try:
                raw_atts = json.loads(payload.attachments_json)
                if isinstance(raw_atts, list):
                    att_list = [normalize_attachment_obj(a) for a in raw_atts if isinstance(a, dict)]
            except Exception:
                att_list = []
        norm_att_json = json.dumps(att_list) if att_list else None

        await conn.execute("""
            INSERT INTO chat_messages (
                id, channel_id, sender_id, message_text, mentions_json, attachments_json,
                is_system_event, reply_to_message_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8);
        """, msg_id, ch_uuid, current_uid, payload.message_text.strip(), mentions_json, norm_att_json, reply_uuid, now)

        # Mark read for sender
        await conn.execute("""
            UPDATE chat_channel_members
            SET last_read_at = $1, last_read_message_id = $2
            WHERE channel_id = $3 AND user_id = $4;
        """, now, msg_id, ch_uuid, current_uid)

    content_str = payload.message_text.strip()
    msg_obj = {
        "id": str(msg_id),
        "channelId": str(ch_uuid),
        "channel_id": str(ch_uuid),
        "senderId": str(current_uid),
        "sender_id": str(current_uid),
        "senderName": sender_name,
        "sender_name": sender_name,
        "sender_email": session.get("email"),
        "avatarUrl": None,
        "content": content_str,
        "text": content_str,
        "message": content_str,
        "message_text": content_str,
        "mentions": mentions,
        "attachments": att_list,
        "is_system_event": False,
        "is_me": True,
        "reply_to_message_id": str(reply_uuid) if reply_uuid else None,
        "createdAt": now.isoformat(),
        "created_at": now.isoformat()
    }

    # Central WebSocket Connection Manager broadcast
    ws_payload = {
        "type": "new_message",
        "message": msg_obj
    }
    await chat_ws_manager.broadcast_to_channel(str(ch_uuid), ws_payload)

    # Broadcast to channel room subscribers & dispatch Web Push
    broadcast_data = {
        "type": "CHANNEL_MESSAGE",
        "channelId": str(ch_uuid),
        "channelType": channel["channel_type"],
        "channelName": channel["name"],
        "senderName": sender_name,
        "message": msg_obj
    }

    # Also support NEW_MESSAGE event type for seamless client consumption
    await ws_manager.broadcast_to_channel(
        channel_id=str(ch_uuid),
        payload=broadcast_data,
        sender_id=str(current_uid),
        notification_title=f"#{channel['name']}" if channel["channel_type"] != "direct" else sender_name,
        notification_body=payload.message_text.strip() or "Sent an attachment",
        force_push_all=force_push_all,
        channel_name=channel["name"],
        channel_type=channel["channel_type"]
    )

    return {"status": "sent", "message": msg_obj}


@router.post("/channels/{channel_id}/read")
async def mark_channel_as_read(
    channel_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Mark all messages in the channel as read by current user."""
    pool = get_db_pool()
    current_uid = uuid.UUID(str(session.get("id") or session.get("user_id")))
    ch_uuid = uuid.UUID(str(channel_id))
    now = datetime.datetime.now(datetime.timezone.utc)

    async with pool.acquire() as conn:
        latest_msg_id = await conn.fetchval("""
            SELECT id FROM chat_messages
            WHERE channel_id = $1
            ORDER BY created_at DESC LIMIT 1;
        """, ch_uuid)

        await conn.execute("""
            UPDATE chat_channel_members
            SET last_read_at = $1, last_read_message_id = $2
            WHERE channel_id = $3 AND user_id = $4;
        """, now, latest_msg_id, ch_uuid, current_uid)

    await ws_manager.broadcast_to_channel(
        channel_id=str(ch_uuid),
        payload={
            "type": "CHANNEL_READ",
            "channelId": str(ch_uuid),
            "userId": str(current_uid),
            "readAt": now.isoformat()
        },
        sender_id=str(current_uid)
    )

    return {"status": "read", "read_at": now.isoformat()}


@router.post("/upload")
async def upload_chat_file(
    file: UploadFile = File(...),
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Upload a file or image attachment for internal chat, stored strictly on disk."""
    content_bytes = await file.read()
    if len(content_bytes) > 25 * 1024 * 1024:  # 25 MB max limit
        raise HTTPException(status_code=400, detail="File size exceeds maximum 25MB limit.")

    meta = save_chat_attachment(file.filename, content_bytes, file.content_type)
    att_obj = normalize_attachment_obj({
        "name": meta["filename"],
        "disk_path": meta["disk_path"],
        "size": meta["file_size_bytes"],
        "mime_type": meta["mime_type"]
    })
    return {
        "status": "uploaded",
        "attachment": att_obj
    }


async def _serve_chat_attachment(
    request: Request,
    raw_path: str,
    download: bool = False,
    token: Optional[str] = None,
    authorization: Optional[str] = None
):
    """Stream or download chat attachment with Zero-Trust authentication and path traversal protection."""
    raw_token = token
    if not raw_token and authorization and authorization.startswith("Bearer "):
        raw_token = authorization.replace("Bearer ", "").strip()
    if not raw_token:
        raw_token = request.cookies.get("enterprise_auth_token") or request.cookies.get("enterprise_session_token")

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required to view or download chat attachments."
        )

    client_ip = get_client_ip(request)
    session = await SessionManager.validate_session(raw_token, client_ip)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid. Please log in again."
        )

    chat_root = os.path.abspath(os.path.join(os.getcwd(), "storage", "chat_attachments"))
    os.makedirs(chat_root, exist_ok=True)

    clean_req = unquote(raw_path or "").strip().replace("\\", "/").lstrip("/")
    if clean_req.startswith("storage/chat_attachments/"):
        clean_req = clean_req[len("storage/chat_attachments/"):].lstrip("/")

    target_abs = os.path.abspath(os.path.join(chat_root, clean_req))
    if not target_abs.startswith(chat_root):
        raise HTTPException(status_code=403, detail="Access denied: invalid file path.")

    if not os.path.isfile(target_abs):
        base_name = os.path.basename(clean_req)
        found_file = None
        for root, _, files in os.walk(chat_root):
            if base_name in files:
                cand = os.path.join(root, base_name)
                if os.path.isfile(cand):
                    found_file = cand
                    break
        if found_file:
            target_abs = found_file
        else:
            raise HTTPException(status_code=404, detail="Physical attachment file missing from storage disk.")

    raw_filename = os.path.basename(target_abs)
    if re.match(r"^[0-9a-fA-F]{12}_", raw_filename):
        download_name = raw_filename[13:]
    else:
        download_name = raw_filename

    mime_type, _ = mimetypes.guess_type(target_abs)
    if not mime_type:
        mime_type = "application/octet-stream"

    safe_inline_mimes = {
        "image/png", "image/jpeg", "image/gif", "image/webp",
        "application/pdf", "audio/mpeg", "audio/wav", "audio/ogg",
        "video/mp4", "video/webm"
    }
    is_safe_inline = mime_type.lower() in safe_inline_mimes
    disposition_type = "attachment" if (download or not is_safe_inline) else "inline"

    return FileResponse(
        path=target_abs,
        filename=download_name,
        media_type=mime_type if is_safe_inline else "application/octet-stream",
        content_disposition_type=disposition_type,
        headers={"Content-Security-Policy": "sandbox"}
    )


@router.get("/attachments/download")
async def download_chat_attachment_query(
    request: Request,
    path: str = Query(...),
    download: bool = Query(True),
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None)
):
    """Explicit download query route for chat attachments."""
    return await _serve_chat_attachment(
        request=request,
        raw_path=path,
        download=download,
        token=token,
        authorization=authorization
    )


@router.get("/attachments/{file_path:path}")
async def get_chat_attachment_path(
    request: Request,
    file_path: str,
    download: bool = Query(False),
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None)
):
    """Serve or stream chat attachment directly with inline preview or attachment download."""
    return await _serve_chat_attachment(
        request=request,
        raw_path=file_path,
        download=download,
        token=token,
        authorization=authorization
    )


# ==============================================================================
# 3. WEBSOCKET REAL-TIME CHANNEL & MULTI-ROOM BROADCAST ENDPOINTS
# ==============================================================================

@router.websocket("/ws/{channel_id}")
async def websocket_channel_endpoint(
    websocket: WebSocket,
    channel_id: str,
    token: Optional[str] = Query(None)
):
    """
    Dedicated channel WebSocket endpoint with automatic reconnection and instant channel broadcast.
    """
    try:
        await websocket.accept()
    except Exception:
        return

    if not token:
        try:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        except Exception:
            pass
        return

    client_ip = websocket.client.host if websocket.client else "127.0.0.1"
    session = await SessionManager.validate_session(token, client_ip)
    if not session:
        try:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        except Exception:
            pass
        return

    user_id = str(session.get("id") or session.get("user_id"))
    user_name = session.get("full_name") or session.get("username") or "User"
    user_email = session.get("email")

    await chat_ws_manager.connect(websocket, channel_id, user_id)
    # Register presence on global ws_manager without duplicating room channel_id broadcast
    await ws_manager.connect(user_id, websocket, channel_ids=[])

    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                data = json.loads(raw_data)
            except Exception:
                data = {"content": raw_data}

            if isinstance(data, dict) and data.get("type") == "PING":
                await websocket.send_json({"type": "PONG"})
                continue

            content = (data.get("content") or data.get("text") or data.get("message") or data.get("message_text") or "").strip()
            raw_atts = data.get("attachments") or []
            attachments = [normalize_attachment_obj(a) for a in raw_atts if isinstance(a, dict)]
            if not content and not attachments:
                continue

            now = datetime.datetime.now(datetime.timezone.utc)
            msg_id = uuid.uuid4()
            ch_uuid = uuid.UUID(str(channel_id))
            att_json = json.dumps(attachments) if attachments else None

            pool = get_db_pool()
            if pool:
                async with pool.acquire() as conn:
                    await conn.execute("""
                        INSERT INTO chat_messages (
                            id, channel_id, sender_id, message_text, attachments_json,
                            is_system_event, created_at
                        ) VALUES ($1, $2, $3, $4, $5, false, $6);
                    """, msg_id, ch_uuid, uuid.UUID(user_id), content, att_json, now)

                    await conn.execute("""
                        UPDATE chat_channel_members
                        SET last_read_at = $1, last_read_message_id = $2
                        WHERE channel_id = $3 AND user_id = $4;
                    """, now, msg_id, ch_uuid, uuid.UUID(user_id))

            payload = {
                "type": "new_message",
                "message": {
                    "id": str(msg_id),
                    "channel_id": str(channel_id),
                    "channelId": str(channel_id),
                    "sender_id": str(user_id),
                    "senderId": str(user_id),
                    "sender_name": user_name,
                    "senderName": user_name,
                    "sender_email": user_email,
                    "content": content,
                    "text": content,
                    "message": content,
                    "message_text": content,
                    "attachments": attachments,
                    "is_system_event": False,
                    "created_at": now.isoformat(),
                    "createdAt": now.isoformat()
                }
            }
            await chat_ws_manager.broadcast_to_channel(channel_id, payload)
            # Emit to global multi-room ws_manager
            await ws_manager.broadcast_to_channel(
                channel_id=channel_id,
                payload={"type": "CHANNEL_MESSAGE", "channelId": channel_id, "message": payload["message"]},
                sender_id=user_id
            )
    except WebSocketDisconnect:
        chat_ws_manager.disconnect(websocket, channel_id, user_id)
        await ws_manager.disconnect(user_id, websocket)
    except Exception as e:
        logger.warning(f"WebSocket channel connection error: {e}")
        chat_ws_manager.disconnect(websocket, channel_id, user_id)
        await ws_manager.disconnect(user_id, websocket)


@router.websocket("/ws")
async def websocket_chat_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None)
):
    """
    Real-time internal chat WebSocket endpoint with multi-room subscription architecture.
    On connect: loads all active channels for the user and subscribes socket to those rooms.
    """
    try:
        await websocket.accept()
    except Exception:
        return

    if not token:
        try:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        except Exception:
            pass
        return

    client_ip = websocket.client.host if websocket.client else "127.0.0.1"
    session = await SessionManager.validate_session(token, client_ip)
    if not session:
        try:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        except Exception:
            pass
        return

    user_id = str(session.get("id") or session.get("user_id"))
    user_name = session.get("full_name") or session.get("username") or "User"

    pool = get_db_pool()
    channel_ids: List[str] = []

    if pool:
        async with pool.acquire() as conn:
            c_rows = await conn.fetch("""
                SELECT channel_id FROM chat_channel_members WHERE user_id = $1::uuid;
            """, uuid.UUID(user_id))
            channel_ids = [str(r["channel_id"]) for r in c_rows]

    # Connect socket and subscribe to all channel rooms
    await ws_manager.connect(user_id, websocket, channel_ids=channel_ids)

    # Send initial state
    try:
        await websocket.send_text(json.dumps({
            "type": "INIT_STATE",
            "userId": user_id,
            "subscribedChannels": channel_ids,
            "onlineUsers": ws_manager.get_online_user_ids()
        }))
    except Exception:
        pass

    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                data = json.loads(raw_data)
            except Exception:
                continue

            msg_type = data.get("type")

            if msg_type == "PING":
                await websocket.send_text(json.dumps({"type": "PONG"}))

            elif msg_type == "JOIN_ROOM":
                ch_id = data.get("channelId")
                if ch_id:
                    await ws_manager.subscribe_user_to_channel(user_id, str(ch_id))
                    await websocket.send_text(json.dumps({"type": "ROOM_JOINED", "channelId": str(ch_id)}))

            elif msg_type == "SEND_MESSAGE":
                ch_id = data.get("channelId")
                text = (data.get("text") or "").strip()
                raw_atts = data.get("attachments") or []
                attachments = [normalize_attachment_obj(a) for a in raw_atts if isinstance(a, dict)]

                if not ch_id or (not text and not attachments):
                    continue

                ch_uuid = uuid.UUID(str(ch_id))
                now = datetime.datetime.now(datetime.timezone.utc)
                msg_id = uuid.uuid4()
                att_json = json.dumps(attachments) if attachments else None

                if pool:
                    async with pool.acquire() as conn:
                        channel = await conn.fetchrow("""
                            SELECT id, name, channel_slug, channel_type, is_announcement_only
                            FROM chat_channels WHERE id = $1;
                        """, ch_uuid)

                        if not channel:
                            continue

                        # Permission check for announcement only channels
                        can_post = await can_post_in_channel(
                            conn=conn,
                            user_id=uuid.UUID(user_id),
                            channel_id=ch_uuid,
                            is_announcement_only=bool(channel["is_announcement_only"]),
                            session=session
                        )
                        if not can_post:
                            await websocket.send_text(json.dumps({
                                "type": "ERROR",
                                "message": "This channel is announcement-only. Only managers and moderators can post."
                            }))
                            continue

                        # Check mentions
                        mentions = extract_mentions(text)
                        force_push_all = False
                        if "@channel" in mentions or "@all" in mentions:
                            if await can_broadcast_mention(conn, uuid.UUID(user_id), ch_uuid, session):
                                force_push_all = True

                        mentions_json = json.dumps(mentions) if mentions else None

                        await conn.execute("""
                            INSERT INTO chat_messages (
                                id, channel_id, sender_id, message_text, mentions_json, attachments_json,
                                is_system_event, created_at
                            ) VALUES ($1, $2, $3, $4, $5, $6, false, $7);
                        """, msg_id, ch_uuid, uuid.UUID(user_id), text, mentions_json, att_json, now)

                        await conn.execute("""
                            UPDATE chat_channel_members
                            SET last_read_at = $1, last_read_message_id = $2
                            WHERE channel_id = $3 AND user_id = $4;
                        """, now, msg_id, ch_uuid, uuid.UUID(user_id))

                    msg_obj = {
                        "id": str(msg_id),
                        "channelId": str(ch_id),
                        "channel_id": str(ch_id),
                        "senderId": user_id,
                        "sender_id": user_id,
                        "senderName": user_name,
                        "sender_name": user_name,
                        "avatarUrl": None,
                        "text": text,
                        "message_text": text,
                        "mentions": mentions,
                        "attachments": attachments,
                        "is_system_event": False,
                        "createdAt": now.isoformat(),
                        "created_at": now.isoformat()
                    }

                    # Broadcast CHANNEL_MESSAGE payload
                    await ws_manager.broadcast_to_channel(
                        channel_id=str(ch_id),
                        payload={
                            "type": "CHANNEL_MESSAGE",
                            "channelId": str(ch_id),
                            "channelType": channel["channel_type"],
                            "channelName": channel["name"],
                            "senderName": user_name,
                            "message": msg_obj
                        },
                        sender_id=user_id,
                        notification_title=f"#{channel['name']}" if channel["channel_type"] != "direct" else user_name,
                        notification_body=text or "Sent an attachment",
                        force_push_all=force_push_all,
                        channel_name=channel["name"],
                        channel_type=channel["channel_type"]
                    )

            elif msg_type == "TYPING":
                ch_id = data.get("channelId")
                is_typing = data.get("isTyping", False)
                if ch_id:
                    await ws_manager.broadcast_to_channel(
                        channel_id=str(ch_id),
                        payload={
                            "type": "USER_TYPING",
                            "channelId": str(ch_id),
                            "userId": user_id,
                            "userName": user_name,
                            "isTyping": is_typing
                        },
                        sender_id=user_id
                    )

            elif msg_type == "MARK_READ":
                ch_id = data.get("channelId")
                if ch_id and pool:
                    now = datetime.datetime.now(datetime.timezone.utc)
                    async with pool.acquire() as conn:
                        latest_msg = await conn.fetchval("SELECT id FROM chat_messages WHERE channel_id = $1::uuid ORDER BY created_at DESC LIMIT 1;", uuid.UUID(str(ch_id)))
                        await conn.execute("""
                            UPDATE chat_channel_members
                            SET last_read_at = $1, last_read_message_id = $2
                            WHERE channel_id = $3::uuid AND user_id = $4::uuid;
                        """, now, latest_msg, uuid.UUID(str(ch_id)), uuid.UUID(user_id))

                    await ws_manager.broadcast_to_channel(
                        channel_id=str(ch_id),
                        payload={
                            "type": "CHANNEL_READ",
                            "channelId": str(ch_id),
                            "userId": user_id,
                            "readAt": now.isoformat()
                        },
                        sender_id=user_id
                    )

    except WebSocketDisconnect:
        await ws_manager.disconnect(user_id, websocket)
    except Exception as e:
        logger.warning(f"WebSocket connection error for user {user_id}: {e}")
        await ws_manager.disconnect(user_id, websocket)
