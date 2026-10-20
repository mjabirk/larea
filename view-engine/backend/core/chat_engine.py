import os
import re
import uuid
import json
import base64
import logging
import asyncio
import datetime
import mimetypes
import threading
from typing import Optional, Dict, Any, List, Set

from fastapi import WebSocket
from starlette.websockets import WebSocketState
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

from backend.core.database import get_db_pool

logger = logging.getLogger("enterprise.chat_engine")

VAPID_STORAGE_DIR = os.path.join(os.getcwd(), "storage", "push_keys")
CHAT_ATTACHMENTS_DIR = os.path.join(os.getcwd(), "storage", "chat_attachments")

os.makedirs(VAPID_STORAGE_DIR, exist_ok=True)
os.makedirs(CHAT_ATTACHMENTS_DIR, exist_ok=True)


# ==============================================================================
# 1. VAPID KEY PAIR MANAGEMENT (W3C WEB PUSH RFC 8292)
# ==============================================================================

class VapidKeyManager:
    """Manages persistent EC P-256 VAPID key pair for Web Push Notifications."""
    
    _private_key_pem: Optional[str] = None
    _public_key_b64: Optional[str] = None

    @classmethod
    def initialize(cls):
        priv_path = os.path.join(VAPID_STORAGE_DIR, "vapid_private.pem")
        pub_path = os.path.join(VAPID_STORAGE_DIR, "vapid_public.txt")

        if os.path.exists(priv_path) and os.path.exists(pub_path):
            try:
                with open(priv_path, "r", encoding="utf-8") as f:
                    cls._private_key_pem = f.read()
                with open(pub_path, "r", encoding="utf-8") as f:
                    cls._public_key_b64 = f.read().strip()
                logger.info("Loaded existing VAPID key pair from storage.")
                return
            except Exception as e:
                logger.warning(f"Error loading existing VAPID keys, regenerating: {e}")

        # Generate new EC SECP256R1 key pair
        private_key = ec.generate_private_key(ec.SECP256R1())
        pem_bytes = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )
        cls._private_key_pem = pem_bytes.decode("utf-8")

        # Uncompressed point format (65 bytes starting with 0x04)
        public_bytes = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint
        )
        cls._public_key_b64 = base64.urlsafe_b64encode(public_bytes).rstrip(b"=").decode("ascii")

        try:
            with open(priv_path, "w", encoding="utf-8") as f:
                f.write(cls._private_key_pem)
            with open(pub_path, "w", encoding="utf-8") as f:
                f.write(cls._public_key_b64)
            logger.info("Generated and saved new VAPID key pair.")
        except Exception as e:
            logger.error(f"Failed to persist VAPID keys to disk: {e}")

    @classmethod
    def get_public_key(cls) -> str:
        if not cls._public_key_b64:
            cls.initialize()
        return cls._public_key_b64 or ""

    @classmethod
    def get_private_key_pem(cls) -> str:
        if not cls._private_key_pem:
            cls.initialize()
        return cls._private_key_pem or ""


# ==============================================================================
# 2. DISK ATTACHMENTS FOR CHAT
# ==============================================================================

def sanitize_filename(filename: str) -> str:
    clean = re.sub(r"[^\w\.\-\_]", "_", os.path.basename(filename))
    return clean or f"attachment_{uuid.uuid4().hex[:8]}"


def save_chat_attachment(filename: str, content_bytes: bytes, mime_type: Optional[str] = None) -> Dict[str, Any]:
    """Persist chat upload to storage/chat_attachments/{YYYY}/{MM}/{uuid}_{clean_filename}."""
    now = datetime.datetime.now(datetime.timezone.utc)
    yyyy = f"{now.year:04d}"
    mm = f"{now.month:02d}"

    rel_dir = os.path.join("storage", "chat_attachments", yyyy, mm)
    abs_dir = os.path.join(os.getcwd(), rel_dir)
    os.makedirs(abs_dir, exist_ok=True)

    clean_name = sanitize_filename(filename)
    unique_name = f"{uuid.uuid4().hex[:12]}_{clean_name}"

    rel_path = os.path.join(rel_dir, unique_name).replace("\\", "/")
    abs_path = os.path.join(abs_dir, unique_name)

    with open(abs_path, "wb") as f:
        f.write(content_bytes)

    if not mime_type:
        guessed, _ = mimetypes.guess_type(filename)
        mime_type = guessed or "application/octet-stream"

    return {
        "filename": filename,
        "disk_path": rel_path,
        "abs_path": abs_path,
        "file_size_bytes": len(content_bytes),
        "mime_type": mime_type
    }


# ==============================================================================
# 3. WEBSOCKET CONNECTION & BROADCAST MANAGER (MULTI-ROOM ARCHITECTURE)
# ==============================================================================

class ConnectionManager:
    """
    Multi-room WebSocket connection and instant dispatch manager.
    Tracks user sessions and maps active WebSockets to channel rooms.
    """

    def __init__(self):
        # user_id -> Set[WebSocket]
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # channel_id -> Set[WebSocket]
        self.channel_rooms: Dict[str, Set[WebSocket]] = {}
        # websocket -> Set[channel_id]
        self.socket_rooms: Dict[WebSocket, Set[str]] = {}
        # websocket -> user_id
        self.socket_users: Dict[WebSocket, str] = {}
        self.lock = asyncio.Lock()

    async def connect(self, user_id: str, websocket: WebSocket, channel_ids: Optional[List[str]] = None):
        """Accept WebSocket connection, register user, and subscribe to their active channel rooms."""
        if websocket.client_state == WebSocketState.CONNECTING:
            await websocket.accept()
        u_str = str(user_id)
        async with self.lock:
            if u_str not in self.active_connections:
                self.active_connections[u_str] = set()
                is_first = True
            else:
                is_first = False
            self.active_connections[u_str].add(websocket)
            self.socket_users[websocket] = u_str
            self.socket_rooms[websocket] = set()

            if channel_ids:
                for cid in channel_ids:
                    c_str = str(cid)
                    if c_str not in self.channel_rooms:
                        self.channel_rooms[c_str] = set()
                    self.channel_rooms[c_str].add(websocket)
                    self.socket_rooms[websocket].add(c_str)

        if is_first:
            # Broadcast user online presence to other connected users
            await self.broadcast_all({
                "type": "USER_PRESENCE",
                "userId": u_str,
                "status": "online"
            }, exclude_user=u_str)

    async def disconnect(self, user_id: str, websocket: WebSocket):
        """Clean up WebSocket from active user sessions and all subscribed channel rooms."""
        u_str = str(user_id)
        async with self.lock:
            if u_str in self.active_connections:
                self.active_connections[u_str].discard(websocket)
                if not self.active_connections[u_str]:
                    del self.active_connections[u_str]
                    is_last = True
                else:
                    is_last = False
            else:
                is_last = False

            self.socket_users.pop(websocket, None)
            rooms = self.socket_rooms.pop(websocket, set())
            for cid in rooms:
                if cid in self.channel_rooms:
                    self.channel_rooms[cid].discard(websocket)
                    if not self.channel_rooms[cid]:
                        del self.channel_rooms[cid]

        if is_last:
            # Broadcast user offline presence
            await self.broadcast_all({
                "type": "USER_PRESENCE",
                "userId": u_str,
                "status": "offline"
            }, exclude_user=u_str)

    async def subscribe_user_to_channel(self, user_id: str, channel_id: str):
        """Subscribe all active WebSockets of a user to a specific channel room."""
        u_str = str(user_id)
        c_str = str(channel_id)
        async with self.lock:
            sockets = self.active_connections.get(u_str, set())
            if c_str not in self.channel_rooms:
                self.channel_rooms[c_str] = set()
            for ws in sockets:
                self.channel_rooms[c_str].add(ws)
                if ws in self.socket_rooms:
                    self.socket_rooms[ws].add(c_str)

    async def unsubscribe_user_from_channel(self, user_id: str, channel_id: str):
        """Unsubscribe all active WebSockets of a user from a channel room."""
        u_str = str(user_id)
        c_str = str(channel_id)
        async with self.lock:
            sockets = self.active_connections.get(u_str, set())
            if c_str in self.channel_rooms:
                for ws in sockets:
                    self.channel_rooms[c_str].discard(ws)
                    if ws in self.socket_rooms:
                        self.socket_rooms[ws].discard(c_str)
                if not self.channel_rooms[c_str]:
                    del self.channel_rooms[c_str]

    def is_user_online(self, user_id: str) -> bool:
        return bool(self.active_connections.get(str(user_id)))

    def get_online_user_ids(self) -> List[str]:
        return list(self.active_connections.keys())

    async def send_to_user(self, user_id: str, payload: Dict[str, Any]) -> bool:
        """Send message to all active WebSocket sessions for a specific user."""
        u_str = str(user_id)
        sockets = list(self.active_connections.get(u_str, []))
        if not sockets:
            return False

        disconnected = []
        sent = False
        text = json.dumps(payload, default=str)
        for ws in sockets:
            try:
                await ws.send_text(text)
                sent = True
            except Exception:
                disconnected.append(ws)

        if disconnected:
            async with self.lock:
                for ws in disconnected:
                    if u_str in self.active_connections:
                        self.active_connections[u_str].discard(ws)

        return sent

    async def broadcast_all(self, payload: Dict[str, Any], exclude_user: Optional[str] = None):
        """Broadcast payload to all currently connected users."""
        text = json.dumps(payload, default=str)
        tasks = []
        for uid, sockets in list(self.active_connections.items()):
            if exclude_user and str(uid) == str(exclude_user):
                continue
            for ws in list(sockets):
                tasks.append(self._safe_send(ws, text))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _safe_send(self, ws: WebSocket, text: str) -> bool:
        try:
            await ws.send_text(text)
            return True
        except Exception:
            return False

    async def broadcast_to_channel(
        self,
        channel_id: str,
        payload: Dict[str, Any],
        sender_id: Optional[str] = None,
        notification_title: Optional[str] = None,
        notification_body: Optional[str] = None,
        force_push_all: bool = False,
        channel_name: Optional[str] = None,
        channel_type: Optional[str] = None,
    ):
        """
        Multi-room broadcast engine:
        1. Emits message payload directly to all sockets subscribed to the channel room.
        2. Resolves channel members to check delivery status and offline status.
        3. If recipient is offline (or force_push_all is active due to @channel/@all broadcast):
           Dispatches W3C Web Push Notification: "#[Channel Name] - Sender Name: Message preview..."
        """
        c_str = str(channel_id)
        text_payload = json.dumps(payload, default=str)

        # Room sockets dispatch
        room_sockets = list(self.channel_rooms.get(c_str, set()))
        delivered_user_ids: Set[str] = set()
        stale_sockets = []

        for ws in room_sockets:
            success = await self._safe_send(ws, text_payload)
            if success:
                uid = self.socket_users.get(ws)
                if uid:
                    delivered_user_ids.add(uid)
            else:
                stale_sockets.append(ws)

        if stale_sockets:
            async with self.lock:
                for ws in stale_sockets:
                    self.channel_rooms.get(c_str, set()).discard(ws)

        # Retrieve members from database to handle users not on active socket or requiring push
        pool = get_db_pool()
        if not pool:
            return

        async with pool.acquire() as conn:
            members = await conn.fetch("""
                SELECT mem.user_id, mem.is_muted, c.name as channel_name, c.channel_type
                FROM chat_channel_members mem
                JOIN chat_channels c ON c.id = mem.channel_id
                WHERE mem.channel_id = $1::uuid;
            """, uuid.UUID(c_str))

        ch_display_name = channel_name or (members[0]["channel_name"] if members else "channel")
        ch_type = channel_type or (members[0]["channel_type"] if members else "direct")

        for m in members:
            member_uid = str(m["user_id"])
            is_muted = m["is_muted"]

            # Never notify sender
            if sender_id and member_uid == str(sender_id):
                continue

            # Check if user received via room socket
            was_delivered_ws = member_uid in delivered_user_ids

            # If user has open sockets but was not in the room yet, send directly
            if not was_delivered_ws:
                was_delivered_ws = await self.send_to_user(member_uid, payload)

            # Push notification check:
            # If force_push_all (authorized @channel or @all broadcast), bypass is_muted and deliver push!
            # Otherwise deliver push if recipient is offline (not on ws) and not muted.
            should_push = False
            if force_push_all:
                should_push = True
            elif not was_delivered_ws and not is_muted:
                should_push = True

            if should_push:
                preview = notification_body or payload.get("message", {}).get("message_text") or payload.get("text", "New message")
                s_name = payload.get("message", {}).get("sender_name") or payload.get("message", {}).get("senderName") or "Colleague"
                
                # Format: "#[Channel Name] - Sender Name: Message preview..."
                if ch_type == "direct":
                    push_title = f"{s_name}"
                    push_body = f"{preview}"
                else:
                    push_title = f"#{ch_display_name}"
                    push_body = f"{s_name}: {preview}"

                asyncio.create_task(
                    dispatch_web_push(
                        user_id=member_uid,
                        title=notification_title or push_title,
                        body=push_body,
                        url=f"/chat?channel={c_str}"
                    )
                )


# Central Channel WebSocket Manager
class ChatConnectionManager:
    def __init__(self):
        # channel_id -> set of active WebSockets
        self.channel_subscriptions: Dict[str, Set[WebSocket]] = {}
        # user_id -> set of active WebSockets (for presence & direct alerts)
        self.user_sockets: Dict[str, Set[WebSocket]] = {}
        self._lock = threading.Lock()

    async def connect(self, websocket: WebSocket, channel_id: str, user_id: str):
        if websocket.client_state == WebSocketState.CONNECTING:
            await websocket.accept()
        c_id = str(channel_id)
        u_id = str(user_id)
        with self._lock:
            self.channel_subscriptions.setdefault(c_id, set()).add(websocket)
            self.user_sockets.setdefault(u_id, set()).add(websocket)

    def disconnect(self, websocket: WebSocket, channel_id: str, user_id: str):
        c_id = str(channel_id)
        u_id = str(user_id)
        with self._lock:
            if c_id in self.channel_subscriptions:
                self.channel_subscriptions[c_id].discard(websocket)
                if not self.channel_subscriptions[c_id]:
                    del self.channel_subscriptions[c_id]
            if u_id in self.user_sockets:
                self.user_sockets[u_id].discard(websocket)
                if not self.user_sockets[u_id]:
                    del self.user_sockets[u_id]

    async def broadcast_to_channel(self, channel_id: str, message_payload: dict):
        c_id = str(channel_id)
        with self._lock:
            subscribers = list(self.channel_subscriptions.get(c_id, []))
        for socket in subscribers:
            try:
                await socket.send_json(message_payload)
            except Exception:
                pass

    def is_user_online(self, user_id: str) -> bool:
        with self._lock:
            return bool(self.user_sockets.get(str(user_id)))


chat_ws_manager = ChatConnectionManager()

# Singleton connection manager (Multi-room global presence)
ws_manager = ConnectionManager()


# ==============================================================================
# 4. DEPARTMENT SYNC & MEMBERSHIP LIFECYCLE HOOKS
# ==============================================================================

def slugify_name(name: str) -> str:
    """Generate clean URL-friendly slug from channel or department name."""
    clean = re.sub(r"[^\w\s-]", "", name.lower())
    clean = re.sub(r"[\s_-]+", "-", clean).strip("-")
    return clean or f"channel-{uuid.uuid4().hex[:6]}"


def extract_mentions(text: str) -> List[str]:
    """Extract mention tokens like @channel, @all, or user names from text."""
    if not text:
        return []
    matches = re.findall(r"@([a-zA-Z0-9_\-\.]+)", text)
    return [f"@{m}" for m in matches]


async def can_broadcast_mention(
    conn,
    user_id: uuid.UUID,
    channel_id: uuid.UUID,
    session: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Check if sender is authorized to use broadcast mentions (@channel, @all).
    Authorized if: admin, superadmin, hr.manage, department manager, or channel moderator/admin.
    """
    if session:
        if session.get("is_superadmin") or session.get("role_id") in ("admin", "superadmin", "manager"):
            return True
        perms = session.get("permissions") or {}
        if perms.get("hr.manage") or perms.get("admin") or perms.get("all"):
            return True

    # Check role in chat_channel_members
    member_role = await conn.fetchval("""
        SELECT role FROM chat_channel_members
        WHERE channel_id = $1 AND user_id = $2;
    """, channel_id, user_id)
    if member_role in ("admin", "moderator"):
        return True

    # Check user role in database
    u_role = await conn.fetchval("SELECT role_id FROM users WHERE id = $1;", user_id)
    if u_role in ("admin", "superadmin", "manager", "hr_manager"):
        return True

    return False


async def can_post_in_channel(
    conn,
    user_id: uuid.UUID,
    channel_id: uuid.UUID,
    is_announcement_only: bool,
    session: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Verify posting permission.
    If is_announcement_only is True: regular members are blocked; only managers/admins/moderators can post.
    """
    if not is_announcement_only:
        return True

    if session:
        if session.get("is_superadmin") or session.get("role_id") in ("admin", "superadmin", "manager"):
            return True
        perms = session.get("permissions") or {}
        if perms.get("hr.manage") or perms.get("admin") or perms.get("all"):
            return True

    member_role = await conn.fetchval("""
        SELECT role FROM chat_channel_members
        WHERE channel_id = $1 AND user_id = $2;
    """, channel_id, user_id)
    if member_role in ("admin", "moderator"):
        return True

    u_role = await conn.fetchval("SELECT role_id FROM users WHERE id = $1;", user_id)
    if u_role in ("admin", "superadmin", "manager", "hr_manager"):
        return True

    return False


async def provision_department_channel(
    dept_name: str,
    dept_id: Optional[uuid.UUID] = None,
    created_by: Optional[uuid.UUID] = None
) -> Dict[str, Any]:
    """
    Department Creation Hook:
    Auto-creates chat_channels record with channel_type = 'department_auto',
    name = department.name, links department_id, and posts a system welcome post.
    """
    pool = get_db_pool()
    if not pool or not dept_name.strip():
        return {}

    slug = slugify_name(dept_name)

    async with pool.acquire() as conn:
        # Check if department already exists
        if not dept_id:
            d_row = await conn.fetchrow("SELECT id FROM departments WHERE name ILIKE $1 OR code ILIKE $2 LIMIT 1;", dept_name.strip(), slug[:10].upper())
            if d_row:
                dept_id = d_row["id"]
            else:
                dept_id = uuid.uuid4()
                await conn.execute("""
                    INSERT INTO departments (id, name, code, description)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (id) DO NOTHING;
                """, dept_id, dept_name.strip(), slug[:10].upper(), f"{dept_name.strip()} Department")

        # Check existing channel
        existing = await conn.fetchrow("""
            SELECT id, name, channel_slug, channel_type, department_id, is_announcement_only
            FROM chat_channels
            WHERE channel_type = 'department_auto' AND (department_id = $1 OR channel_slug = $2 OR name ILIKE $3)
            LIMIT 1;
        """, dept_id, slug, dept_name.strip())

        if existing:
            return dict(existing)

        # Create new department channel
        chan_id = uuid.uuid4()
        now = datetime.datetime.now(datetime.timezone.utc)
        await conn.execute("""
            INSERT INTO chat_channels (
                id, name, channel_slug, channel_type, department_id, description, is_announcement_only, created_by, created_at, updated_at
            ) VALUES ($1, $2, $3, 'department_auto', $4, $5, false, $6, $7, $7)
            ON CONFLICT (id) DO NOTHING;
        """, chan_id, dept_name.strip(), slug, dept_id, f"Official department channel for {dept_name.strip()}.", created_by, now)

        # Initial welcome post
        msg_id = uuid.uuid4()
        welcome_text = f"Welcome to the #{slug} department channel! Department members are synchronized automatically with HR assignment records."
        await conn.execute("""
            INSERT INTO chat_messages (
                id, channel_id, sender_id, message_text, is_system_event, created_at
            ) VALUES ($1, $2, NULL, $3, true, $4);
        """, msg_id, chan_id, welcome_text, now)

        logger.info(f"Provisioned department channel #{slug} for department '{dept_name}'.")

        return {
            "id": chan_id,
            "name": dept_name.strip(),
            "channel_slug": slug,
            "channel_type": "department_auto",
            "department_id": dept_id,
            "is_announcement_only": False
        }


async def handle_employee_department_sync(
    employee_id: uuid.UUID,
    new_dept_name: Optional[str],
    old_dept_name: Optional[str] = None,
    is_terminated: bool = False,
    emp_name: Optional[str] = None
):
    """
    Employee Assignment & Transfer Hook:
    1. If terminated: revoke membership across all internal channels.
    2. If department changed:
       - Auto-remove membership from old department channel and post system transfer message.
       - Provision or find new department_auto channel and add employee (is_auto_assigned = TRUE).
    """
    pool = get_db_pool()
    if not pool:
        return

    async with pool.acquire() as conn:
        emp = await conn.fetchrow("""
            SELECT id, full_name, work_email, personal_email, department_id, status
            FROM employees WHERE id = $1;
        """, employee_id)
        if not emp:
            return

        display_name = emp_name or emp["full_name"] or "Employee"
        work_email = emp["work_email"]
        personal_email = emp["personal_email"]

        # Resolve user account linked to this employee
        u_row = None
        if work_email:
            u_row = await conn.fetchrow("SELECT id, email, full_name, role_id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1;", work_email.strip())
        if not u_row and personal_email:
            u_row = await conn.fetchrow("SELECT id, email, full_name, role_id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1;", personal_email.strip())
        if not u_row and display_name:
            u_row = await conn.fetchrow("SELECT id, email, full_name, role_id FROM users WHERE full_name ILIKE $1 LIMIT 1;", display_name.strip())

        if not u_row:
            logger.info(f"Department sync: No user account found for employee {display_name} ({employee_id}).")
            return

        user_id = u_row["id"]
        u_str = str(user_id)

        # A. Termination / Deactivation -> Revoke all internal memberships
        if is_terminated or (emp["status"] and emp["status"].lower() == "terminated"):
            await conn.execute("DELETE FROM chat_channel_members WHERE user_id = $1;", user_id)
            logger.info(f"Revoked all chat memberships for terminated employee {display_name} (User {user_id}).")
            await ws_manager.send_to_user(u_str, {
                "type": "MEMBERSHIPS_REVOKED",
                "reason": "Employee account terminated"
            })
            return

        # B. Transfer from old department
        if old_dept_name and str(old_dept_name).strip() and str(old_dept_name).strip() != str(new_dept_name or "").strip():
            old_slug = slugify_name(old_dept_name.strip())
            old_channel = await conn.fetchrow("""
                SELECT id, name FROM chat_channels
                WHERE channel_type = 'department_auto' AND (channel_slug = $1 OR name ILIKE $2)
                LIMIT 1;
            """, old_slug, old_dept_name.strip())

            if old_channel:
                old_cid = old_channel["id"]
                # Remove membership
                await conn.execute("""
                    DELETE FROM chat_channel_members
                    WHERE channel_id = $1 AND user_id = $2;
                """, old_cid, user_id)

                await ws_manager.unsubscribe_user_from_channel(u_str, str(old_cid))

                # Post system transfer message in old channel
                sys_msg_id = uuid.uuid4()
                now = datetime.datetime.now(datetime.timezone.utc)
                xfer_msg = f"{display_name} transferred from {old_channel['name']} to {new_dept_name or 'another department'}."
                await conn.execute("""
                    INSERT INTO chat_messages (id, channel_id, sender_id, message_text, is_system_event, created_at)
                    VALUES ($1, $2, NULL, $3, true, $4);
                """, sys_msg_id, old_cid, xfer_msg, now)

                # Broadcast transfer event
                await ws_manager.broadcast_to_channel(
                    channel_id=str(old_cid),
                    payload={
                        "type": "CHANNEL_MESSAGE",
                        "channelId": str(old_cid),
                        "channelType": "department_auto",
                        "message": {
                            "id": str(sys_msg_id),
                            "senderId": None,
                            "senderName": "System",
                            "avatarUrl": None,
                            "text": xfer_msg,
                            "message_text": xfer_msg,
                            "is_system_event": True,
                            "createdAt": now.isoformat(),
                            "created_at": now.isoformat()
                        }
                    },
                    sender_id=None,
                    channel_name=old_channel["name"],
                    channel_type="department_auto"
                )

        # C. Assign to new department
        if new_dept_name and new_dept_name.strip():
            target_dept = new_dept_name.strip()
            new_slug = slugify_name(target_dept)

            new_channel = await conn.fetchrow("""
                SELECT id, name, channel_slug FROM chat_channels
                WHERE channel_type = 'department_auto' AND (channel_slug = $1 OR name ILIKE $2)
                LIMIT 1;
            """, new_slug, target_dept)

            if not new_channel:
                new_channel = await provision_department_channel(target_dept)

            if new_channel:
                target_cid = new_channel["id"]
                # Add to chat_channel_members with is_auto_assigned = TRUE
                await conn.execute("""
                    INSERT INTO chat_channel_members (id, channel_id, user_id, role, is_auto_assigned, joined_at)
                    VALUES ($1, $2, $3, 'member', true, CURRENT_TIMESTAMP)
                    ON CONFLICT (channel_id, user_id) DO UPDATE SET is_auto_assigned = true;
                """, uuid.uuid4(), target_cid, user_id)

                await ws_manager.subscribe_user_to_channel(u_str, str(target_cid))

                # Post system join message in new channel
                sys_msg_id = uuid.uuid4()
                now = datetime.datetime.now(datetime.timezone.utc)
                join_msg = f"{display_name} joined #{new_channel['channel_slug'] or new_slug} department channel."
                await conn.execute("""
                    INSERT INTO chat_messages (id, channel_id, sender_id, message_text, is_system_event, created_at)
                    VALUES ($1, $2, NULL, $3, true, $4);
                """, sys_msg_id, target_cid, join_msg, now)

                # Broadcast system join message
                await ws_manager.broadcast_to_channel(
                    channel_id=str(target_cid),
                    payload={
                        "type": "CHANNEL_MESSAGE",
                        "channelId": str(target_cid),
                        "channelType": "department_auto",
                        "message": {
                            "id": str(sys_msg_id),
                            "senderId": None,
                            "senderName": "System",
                            "avatarUrl": None,
                            "text": join_msg,
                            "message_text": join_msg,
                            "is_system_event": True,
                            "createdAt": now.isoformat(),
                            "created_at": now.isoformat()
                        }
                    },
                    sender_id=None,
                    channel_name=new_channel.get("name", target_dept),
                    channel_type="department_auto"
                )
                logger.info(f"Auto-assigned {display_name} to #{new_channel.get('name')} (Channel {target_cid}).")


# ==============================================================================
# 4. W3C WEB PUSH DISPATCHER (PYWEBPUSH / VAPID)
# ==============================================================================

async def dispatch_web_push(user_id: str, title: str, body: str, url: str = "/chat"):
    """Send W3C Web Push notification to all registered subscriptions of a user."""
    pool = get_db_pool()
    if not pool:
        return

    try:
        u_uuid = uuid.UUID(str(user_id))
    except ValueError:
        return

    async with pool.acquire() as conn:
        subs = await conn.fetch("""
            SELECT id, endpoint, p256dh_key, auth_key
            FROM web_push_subscriptions
            WHERE user_id = $1;
        """, u_uuid)

    if not subs:
        return

    priv_key_pem = VapidKeyManager.get_private_key_pem()
    if not priv_key_pem:
        return

    payload_data = json.dumps({
        "title": title,
        "body": body,
        "icon": "/favicon.ico",
        "badge": "/favicon.ico",
        "url": url,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    })

    expired_sub_ids = []

    def _send_sync(sub_row):
        try:
            from pywebpush import webpush, WebPushException
            subscription_info = {
                "endpoint": sub_row["endpoint"],
                "keys": {
                    "p256dh": sub_row["p256dh_key"],
                    "auth": sub_row["auth_key"]
                }
            }
            webpush(
                subscription_info=subscription_info,
                data=payload_data,
                vapid_private_key=priv_key_pem,
                vapid_claims={"sub": "mailto:admin@apexglobal.qa"}
            )
            return None
        except Exception as e:
            err_msg = str(e)
            logger.info(f"Web Push delivery result for sub {sub_row['id']}: {err_msg}")
            # If 404 or 410, subscription has expired on push service (Google FCM, Mozilla Autopush)
            if "404" in err_msg or "410" in err_msg or "Gone" in err_msg:
                return sub_row["id"]
            return None

    loop = asyncio.get_running_loop()
    for s in subs:
        result = await loop.run_in_executor(None, _send_sync, s)
        if result:
            expired_sub_ids.append(result)

    # Prune expired subscriptions
    if expired_sub_ids:
        async with pool.acquire() as conn:
            await conn.execute("""
                DELETE FROM web_push_subscriptions
                WHERE id = ANY($1::uuid[]);
            """, expired_sub_ids)
            logger.info(f"Pruned {len(expired_sub_ids)} expired web push subscriptions.")
