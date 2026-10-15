import os
import uuid
import json
import datetime
import logging
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, status, Request, Depends, Query, UploadFile, File, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from backend.core.database import get_db_pool
from backend.core.dependencies import get_current_user_session
from backend.core.session import SessionManager
from backend.core.chat_engine import (
    VapidKeyManager,
    ws_manager,
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

            # Unread messages count
            unread_cnt = await conn.fetchval("""
                SELECT COUNT(*)
                FROM chat_messages
                WHERE channel_id = $1
                  AND (sender_id IS NULL OR sender_id != $2)
                  AND created_at > $3;
            """, ch_id, current_uid, last_read)

            # Latest message snippet
            last_msg_row = await conn.fetchrow("""
                SELECT m.id, m.message_text, m.created_at, m.sender_id, m.is_system_event, u.full_name as sender_name
                FROM chat_messages m
                LEFT JOIN users u ON u.id = m.sender_id
                WHERE m.channel_id = $1
                ORDER BY m.created_at DESC
                LIMIT 1;
            """, ch_id)

            last_msg = None
            if last_msg_row:
                last_msg = {
                    "id": str(last_msg_row["id"]),
                    "text": last_msg_row["message_text"],
                    "sender_id": str(last_msg_row["sender_id"]) if last_msg_row["sender_id"] else None,
                    "sender_name": last_msg_row["sender_name"] or ("System" if last_msg_row["is_system_event"] else "Colleague"),
                    "created_at": last_msg_row["created_at"].isoformat()
                }

            # Other member details (for 1-on-1 direct chats)
            other_user = None
            display_name = ch["name"]

            if ch_type == "direct":
                other_member = await conn.fetchrow("""
                    SELECT u.id, split_part(u.email, '@', 1) as username, u.full_name, u.email
                    FROM chat_channel_members mem
                    JOIN users u ON u.id = mem.user_id
                    WHERE mem.channel_id = $1 AND mem.user_id != $2
                    LIMIT 1;
                """, ch_id, current_uid)

                if other_member:
                    ou_id_str = str(other_member["id"])
                    other_user = {
                        "id": ou_id_str,
                        "username": other_member["username"],
                        "full_name": other_member["full_name"],
                        "email": other_member["email"],
                        "is_online": ws_manager.is_user_online(ou_id_str)
                    }
                    display_name = other_member["full_name"] or other_member["username"]

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
                "unread_count": unread_cnt or 0,
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
                            member_count += 1
                    except ValueError:
                        pass

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
    offset: int = Query(0, ge=0),
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Retrieve message history for a channel."""
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

        rows = await conn.fetch("""
            SELECT m.id, m.channel_id, m.sender_id, m.message_text, m.attachments_json,
                   m.is_system_event, m.created_at,
                   split_part(u.email, '@', 1) as sender_username, u.full_name as sender_name, u.email as sender_email
            FROM chat_messages m
            LEFT JOIN users u ON u.id = m.sender_id
            WHERE m.channel_id = $1
            ORDER BY m.created_at ASC
            LIMIT $2 OFFSET $3;
        """, ch_uuid, limit, offset)

        messages = []
        for r in rows:
            attachments = []
            if r["attachments_json"]:
                try:
                    attachments = json.loads(r["attachments_json"])
                except Exception:
                    attachments = []

            messages.append({
                "id": str(r["id"]),
                "channel_id": str(r["channel_id"]),
                "sender_id": str(r["sender_id"]) if r["sender_id"] else None,
                "sender_name": r["sender_name"] or r["sender_username"] or "System",
                "sender_email": r["sender_email"],
                "message_text": r["message_text"],
                "attachments": attachments,
                "is_system_event": r["is_system_event"],
                "created_at": r["created_at"].isoformat()
            })

    return {"messages": messages}


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

        await conn.execute("""
            INSERT INTO chat_messages (
                id, channel_id, sender_id, message_text, mentions_json, attachments_json,
                is_system_event, reply_to_message_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8);
        """, msg_id, ch_uuid, current_uid, payload.message_text.strip(), mentions_json, payload.attachments_json, reply_uuid, now)

        # Mark read for sender
        await conn.execute("""
            UPDATE chat_channel_members
            SET last_read_at = $1, last_read_message_id = $2
            WHERE channel_id = $3 AND user_id = $4;
        """, now, msg_id, ch_uuid, current_uid)

    att_list = []
    if payload.attachments_json:
        try:
            att_list = json.loads(payload.attachments_json)
        except Exception:
            pass

    msg_obj = {
        "id": str(msg_id),
        "channelId": str(ch_uuid),
        "channel_id": str(ch_uuid),
        "senderId": str(current_uid),
        "sender_id": str(current_uid),
        "senderName": sender_name,
        "sender_name": sender_name,
        "avatarUrl": None,
        "text": payload.message_text.strip(),
        "message_text": payload.message_text.strip(),
        "mentions": mentions,
        "attachments": att_list,
        "is_system_event": False,
        "reply_to_message_id": str(reply_uuid) if reply_uuid else None,
        "createdAt": now.isoformat(),
        "created_at": now.isoformat()
    }

    # Broadcast to channel room subscribers & dispatch Web Push
    broadcast_data = {
        "type": "CHANNEL_MESSAGE",
        "channelId": str(ch_uuid),
        "channelType": channel["channel_type"],
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

    # Legacy NEW_MESSAGE emit for components expecting type === 'NEW_MESSAGE'
    await ws_manager.broadcast_to_channel(
        channel_id=str(ch_uuid),
        payload={"type": "NEW_MESSAGE", "message": msg_obj},
        sender_id=str(current_uid)
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
    return {
        "status": "uploaded",
        "attachment": {
            "name": meta["filename"],
            "disk_path": meta["disk_path"],
            "size": meta["file_size_bytes"],
            "mime_type": meta["mime_type"]
        }
    }


# ==============================================================================
# 3. WEBSOCKET REAL-TIME MULTI-ROOM BROADCAST ENDPOINT (/ws/chat)
# ==============================================================================

@router.websocket("/ws")
async def websocket_chat_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None)
):
    """
    Real-time internal chat WebSocket endpoint with multi-room subscription architecture.
    On connect: loads all active channels for the user and subscribes socket to those rooms.
    """
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    client_ip = websocket.client.host if websocket.client else "127.0.0.1"
    session = await SessionManager.validate_session(token, client_ip)
    if not session:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
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
                attachments = data.get("attachments") or []

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
                            "message": msg_obj
                        },
                        sender_id=user_id,
                        notification_title=f"#{channel['name']}" if channel["channel_type"] != "direct" else user_name,
                        notification_body=text or "Sent an attachment",
                        force_push_all=force_push_all,
                        channel_name=channel["name"],
                        channel_type=channel["channel_type"]
                    )

                    # Also broadcast legacy NEW_MESSAGE for compatibility
                    await ws_manager.broadcast_to_channel(
                        channel_id=str(ch_id),
                        payload={"type": "NEW_MESSAGE", "message": msg_obj},
                        sender_id=user_id
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
