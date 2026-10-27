import uuid
import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, status, Request, Depends, Query
from pydantic import BaseModel

from backend.core.database import get_db_pool
from backend.core.dependencies import get_current_user_session, get_client_ip, check_permission
from backend.core.sequences import uuid7

router = APIRouter(prefix="/api/v1/notifications", tags=["Notifications"])


class CreateNotificationPayload(BaseModel):
    user_id: Optional[str] = None
    title: str
    message: str
    type: Optional[str] = "info"  # 'info', 'warning', 'approval', 'payroll', 'compliance'
    link_url: Optional[str] = None


@router.get("")
async def list_notifications(
    limit: int = Query(30, ge=1, le=100),
    unread_only: bool = Query(False),
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Retrieve real-time notifications feed for the current authenticated user.
    Also calculates the total active unread count for the top-bar bell badge.
    """
    pool = get_db_pool()
    user_id = session.get("user_id")
    is_superadmin = session.get("is_superadmin", False)

    async with pool.acquire() as conn:
        # Calculate active unread count
        if is_superadmin:
            unread_count = await conn.fetchval(
                "SELECT COUNT(*) FROM notifications WHERE is_read = false;"
            )
            query = """
                SELECT id, user_id, title, message, type, link_url, is_read, created_at
                FROM notifications
                WHERE ($1::boolean = false OR is_read = false)
                ORDER BY created_at DESC
                LIMIT $2;
            """
            rows = await conn.fetch(query, unread_only, limit)
        else:
            unread_count = await conn.fetchval("""
                SELECT COUNT(*) FROM notifications 
                WHERE (user_id = $1::uuid OR user_id IS NULL) AND is_read = false;
            """, user_id)
            query = """
                SELECT id, user_id, title, message, type, link_url, is_read, created_at
                FROM notifications
                WHERE (user_id = $1::uuid OR user_id IS NULL)
                  AND ($2::boolean = false OR is_read = false)
                ORDER BY created_at DESC
                LIMIT $3;
            """
            rows = await conn.fetch(query, user_id, unread_only, limit)

        items = []
        for r in rows:
            items.append({
                "id": str(r["id"]),
                "user_id": str(r["user_id"]) if r["user_id"] else None,
                "title": r["title"],
                "message": r["message"],
                "type": r["type"],
                "link_url": r["link_url"],
                "is_read": bool(r["is_read"]),
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            })

    return {
        "unread_count": unread_count or 0,
        "notifications": items,
        "total": len(items)
    }


@router.patch("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Mark an individual notification as read."""
    pool = get_db_pool()
    user_id = session.get("user_id")
    is_superadmin = session.get("is_superadmin", False)

    async with pool.acquire() as conn:
        if is_superadmin:
            res = await conn.execute("""
                UPDATE notifications
                SET is_read = true
                WHERE id = $1::uuid;
            """, notification_id)
        else:
            res = await conn.execute("""
                UPDATE notifications
                SET is_read = true
                WHERE id = $1::uuid AND (user_id = $2::uuid OR user_id IS NULL);
            """, notification_id, user_id)

        if res == "UPDATE 0":
            raise HTTPException(status_code=404, detail="Notification not found.")

    return {"status": "success", "id": notification_id, "is_read": True}


@router.post("/mark-all-read")
async def mark_all_notifications_read(
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Mark all notifications as read for current user or across tenant."""
    pool = get_db_pool()
    user_id = session.get("user_id")
    is_superadmin = session.get("is_superadmin", False)

    async with pool.acquire() as conn:
        if is_superadmin:
            await conn.execute("UPDATE notifications SET is_read = true WHERE is_read = false;")
        else:
            await conn.execute("""
                UPDATE notifications 
                SET is_read = true 
                WHERE (user_id = $1::uuid OR user_id IS NULL) AND is_read = false;
            """, user_id)

    return {"status": "success", "message": "All notifications marked as read."}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Remove a notification from feed."""
    pool = get_db_pool()
    user_id = session.get("user_id")
    is_superadmin = session.get("is_superadmin", False)

    async with pool.acquire() as conn:
        if is_superadmin:
            res = await conn.execute("DELETE FROM notifications WHERE id = $1::uuid;", notification_id)
        else:
            res = await conn.execute("""
                DELETE FROM notifications
                WHERE id = $1::uuid AND (user_id = $2::uuid OR user_id IS NULL);
            """, notification_id, user_id)

        if res == "DELETE 0":
            raise HTTPException(status_code=404, detail="Notification not found.")

    return {"status": "success", "deleted_id": notification_id}


@router.post("")
async def create_notification(
    payload: CreateNotificationPayload,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Publish a new notification event."""
    current_uid = str(session.get("user_id") or "")
    if payload.user_id and str(payload.user_id) != current_uid:
        if not session.get("is_superadmin") and not check_permission(session, "users.manage"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Cannot dispatch notifications to other users without 'users.manage' permission."
            )

    pool = get_db_pool()
    notif_id = uuid7()
    now = datetime.datetime.now(datetime.timezone.utc)
    target_user = payload.user_id or session.get("user_id")

    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO notifications (id, user_id, title, message, type, link_url, is_read, created_at)
            VALUES ($1, $2::uuid, $3, $4, $5, $6, false, $7);
        """, notif_id, target_user, payload.title, payload.message, payload.type, payload.link_url, now)

    return {
        "status": "success",
        "notification": {
            "id": str(notif_id),
            "user_id": target_user,
            "title": payload.title,
            "message": payload.message,
            "type": payload.type,
            "link_url": payload.link_url,
            "is_read": False,
            "created_at": now.isoformat()
        }
    }
