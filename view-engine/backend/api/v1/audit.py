import uuid
import json
import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, status, Request, Depends
from pydantic import BaseModel

from backend.core.database import get_db_pool
from backend.core.dependencies import get_current_user_session, get_client_ip

router = APIRouter(prefix="/api/v1/audit-logs", tags=["Audit & Chatter Engine"])


class LogNoteRequest(BaseModel):
    note: str
    author_name: Optional[str] = None


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


@router.get("/{entity_type}/{entity_id}")
async def get_audit_trail(
    entity_type: str,
    entity_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """Retrieve full chronological audit trail and internal notes for an entity."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, entity_type, entity_id, action, changed_by_user_id, changed_by_name,
                   changes, note, ip_address, created_at
            FROM audit_logs
            WHERE entity_type = $1 AND entity_id = $2
            ORDER BY created_at DESC;
        """, entity_type, entity_id)

        events = []
        for r in rows:
            events.append({
                "id": str(r["id"]),
                "entity_type": r["entity_type"],
                "entity_id": r["entity_id"],
                "action": r["action"],
                "changed_by_user_id": str(r["changed_by_user_id"]) if r["changed_by_user_id"] else None,
                "changed_by_name": r["changed_by_name"] or "Authorized User",
                "changes": json.loads(r["changes"]) if isinstance(r["changes"], str) else (r["changes"] or {}),
                "note": r["note"],
                "ip_address": r["ip_address"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            })

        return {"audit_trail": events, "count": len(events)}


@router.post("/{entity_type}/{entity_id}/note")
async def log_internal_note(
    entity_type: str,
    entity_id: str,
    payload: LogNoteRequest,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """Log an internal operational discussion note into the record chatter stream."""
    clean_note = payload.note.strip()
    if not clean_note:
        raise HTTPException(status_code=400, detail="Note content cannot be empty.")

    pool = get_db_pool()
    client_ip = get_client_ip(request) if request else "127.0.0.1"
    note_id = uuid.uuid4()
    now = datetime.datetime.now(datetime.timezone.utc)

    async with pool.acquire() as conn:
        user_id, dynamic_author = await resolve_audit_author(conn, session)
        author_name = payload.author_name or dynamic_author

        await conn.execute("""
            INSERT INTO audit_logs (
                id, entity_type, entity_id, action, changed_by_user_id, changed_by_name, note, ip_address, created_at
            ) VALUES (
                $1::uuid, $2, $3, 'NOTE', $4, $5, $6, $7, $8
            );
        """, note_id, entity_type, entity_id, user_id, author_name, clean_note, client_ip, now)

    return {
        "id": str(note_id),
        "entity_type": entity_type,
        "entity_id": entity_id,
        "action": "NOTE",
        "changed_by_user_id": str(user_id) if user_id else None,
        "changed_by_name": author_name,
        "note": clean_note,
        "ip_address": client_ip,
        "created_at": now.isoformat(),
        "message": "Note logged to record chatter."
    }
