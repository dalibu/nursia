"""
WebSocket router for real-time updates
"""
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import Dict, List, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from jose import jwt, JWTError
import json
import logging

from config.settings import settings

router = APIRouter(tags=["websocket"])
logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages workspace-scoped WebSocket connections."""
    
    def __init__(self):
        # (workspace_id, user_id) -> websocket connections
        self.active_connections: Dict[tuple[int, int], List[WebSocket]] = {}
        # Track which users need timer updates (have active sessions)
        self.timer_subscriptions: Dict[int, bool] = {}
    
    async def connect(self, websocket: WebSocket, user_id: int, workspace_id: int):
        """Accept connection and register it"""
        await websocket.accept()
        key = (workspace_id, user_id)
        if key not in self.active_connections:
            self.active_connections[key] = []
        self.active_connections[key].append(websocket)
        logger.info(f"WebSocket connected: user_id={user_id}, total connections={self.get_total_connections()}")
    
    def disconnect(self, websocket: WebSocket, user_id: int, workspace_id: int):
        """Remove connection from registry"""
        key = (workspace_id, user_id)
        if key in self.active_connections:
            if websocket in self.active_connections[key]:
                self.active_connections[key].remove(websocket)
            if not self.active_connections[key]:
                del self.active_connections[key]
        logger.info(f"WebSocket disconnected: user_id={user_id}, total connections={self.get_total_connections()}")
    
    def get_total_connections(self) -> int:
        """Get total number of active connections"""
        return sum(len(conns) for conns in self.active_connections.values())
    
    def get_connected_users(self) -> List[tuple[int, int]]:
        """Return (workspace_id, user_id) pairs for connected users."""
        return list(self.active_connections.keys())
    
    async def broadcast(
        self,
        event: dict,
        user_ids: Optional[List[int]] = None,
        exclude_user_id: Optional[int] = None,
        workspace_id: Optional[int] = None,
    ):
        """
        Send event to connected users.
        :param event: The message to send.
        :param user_ids: If provided, send only to these users.
        :param exclude_user_id: If provided, don't send to this user.
        """
        logger.info(f"Broadcasting event: {event.get('type')}, target_users={user_ids}, exclude={exclude_user_id}")
        message = json.dumps(event)
        disconnected = []
        
        # Determine who to send to
        if workspace_id is None:
            recipients = list(self.active_connections.keys())
        elif user_ids is None:
            recipients = [
                key for key in self.active_connections if key[0] == workspace_id
            ]
        else:
            recipients = [
                (workspace_id, user_id)
                for user_id in user_ids
                if (workspace_id, user_id) in self.active_connections
            ]
        
        for key in recipients:
            current_workspace_id, user_id = key
            if exclude_user_id and user_id == exclude_user_id:
                continue
            
            connections = self.active_connections.get(key)
            if not connections:
                continue
                
            for websocket in connections:
                try:
                    await websocket.send_text(message)
                except Exception as e:
                    logger.warning(f"Failed to send to user {user_id}: {e}")
                    disconnected.append((websocket, user_id, current_workspace_id))
        
        # Clean up failed connections
        for websocket, user_id, current_workspace_id in disconnected:
            self.disconnect(websocket, user_id, current_workspace_id)
    
    async def send_to_user(self, user_id: int, workspace_id: int, event: dict):
        """Send event to specific user (all their connections)"""
        key = (workspace_id, user_id)
        if key not in self.active_connections:
            return
        
        message = json.dumps(event)
        disconnected = []
        
        for websocket in self.active_connections[key]:
            try:
                await websocket.send_text(message)
            except Exception as e:
                logger.warning(f"Failed to send to user {user_id}: {e}")
                disconnected.append(websocket)
        
        for websocket in disconnected:
            self.disconnect(websocket, user_id, workspace_id)


# Global manager instance
manager = ConnectionManager()


def get_user_from_token(token: str) -> Optional[tuple[int, Optional[int]]]:
    """Extract user and selected workspace IDs from a JWT token."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id:
            workspace_id = payload.get("workspace_id")
            return int(user_id), int(workspace_id) if workspace_id is not None else None
    except JWTError as e:
        logger.warning(f"JWT decode error: {e}")
    return None


async def get_admin_ids(workspace_id: int) -> List[int]:
    """Get administrator IDs for one workspace."""
    from database.core import AsyncSessionLocal
    from database.models import WorkspaceMember
    from sqlalchemy import select
    
    async with AsyncSessionLocal() as db:
        query = select(WorkspaceMember.user_id).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.role == "admin",
        )
        result = await db.execute(query)
        return result.scalars().all()


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...)
):
    """WebSocket endpoint for real-time updates.
    
    Connect with: ws://host/api/ws?token=<jwt_token>
    
    Events received:
    - payment_created: {type: "payment_created", payment_id: int, payer_id: int}
    - payment_updated: {type: "payment_updated", payment_id: int}
    - payment_deleted: {type: "payment_deleted", payment_id: int}
    - assignment_started: {type: "assignment_started", assignment_id: int, user_id: int}
    - assignment_stopped: {type: "assignment_stopped", assignment_id: int, user_id: int}
    """
    # Validate token
    identity = get_user_from_token(token)
    if not identity:
        await websocket.close(code=4001, reason="Invalid token")
        return
    user_id, token_workspace_id = identity

    from database.core import AsyncSessionLocal
    from database.models import WorkspaceMember
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        membership_query = select(WorkspaceMember.workspace_id).where(
            WorkspaceMember.user_id == user_id
        )
        if token_workspace_id is not None:
            membership_query = membership_query.where(
                WorkspaceMember.workspace_id == token_workspace_id
            )
        membership = await db.execute(
            membership_query.order_by(WorkspaceMember.workspace_id).limit(1)
        )
        workspace_id = membership.scalar_one_or_none()
    if workspace_id is None:
        await websocket.close(code=4001, reason="No workspace access")
        return

    await manager.connect(websocket, user_id, workspace_id)
    
    try:
        while True:
            # Keep connection alive, wait for client messages
            data = await websocket.receive_text()
            
            # Handle ping/pong for keep-alive
            if data == "ping":
                await websocket.send_text("pong")
            else:
                # Log any other messages (for future client->server events)
                logger.debug(f"Received from user {user_id}: {data}")
    
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id, workspace_id)
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        manager.disconnect(websocket, user_id, workspace_id)


# Timer broadcast task
import asyncio
from datetime import datetime

_timer_task = None

async def broadcast_timer_updates():
    """Background task that broadcasts timer updates every second to connected clients."""
    from database.core import AsyncSessionLocal
    from database.models import Task, Assignment, WorkspaceMember
    from sqlalchemy import select
    from sqlalchemy.orm import joinedload
    from utils.timeutil import now_server
    
    logger.info("Timer broadcast task started")
    
    prev_active_users = set()
    
    while True:
        try:
            await asyncio.sleep(1)
            
            # Skip if no connections
            if manager.get_total_connections() == 0:
                prev_active_users.clear()
                continue
            
            connected_users = manager.get_connected_users()
            if not connected_users:
                prev_active_users.clear()
                continue
            
            async with AsyncSessionLocal() as db:
                # Get all active tasks (open sessions)
                query = select(Task).join(Assignment).options(
                    joinedload(Task.assignment).joinedload(Assignment.worker),
                    joinedload(Task.assignment).joinedload(Assignment.tasks)
                ).where(Task.end_time == None)
                
                result = await db.execute(query)
                active_tasks = result.scalars().unique().all()
                
                now = now_server()
                
                # Build timer data for each active session
                sessions_by_workspace = {}
                workspace_admins = set()
                workspace_members = set()

                for workspace_id, user_id in connected_users:
                    membership_result = await db.execute(
                        select(WorkspaceMember.role).where(
                            WorkspaceMember.workspace_id == workspace_id,
                            WorkspaceMember.user_id == user_id,
                        )
                    )
                    membership_role = membership_result.scalar_one_or_none()
                    if membership_role is not None:
                        workspace_members.add((workspace_id, user_id))
                        if membership_role == "admin":
                            workspace_admins.add((workspace_id, user_id))
                
                if active_tasks:
                    for task in active_tasks:
                        assignment = task.assignment
                        
                        # Calculate times
                        total_work_seconds = 0
                        total_pause_seconds = 0
                        
                        for t in assignment.tasks:
                            if t.end_time:
                                seg_seconds = t.duration_seconds
                            elif t.id == task.id:
                                # t.start_time is now full datetime
                                seg_seconds = int((now - t.start_time).total_seconds())
                            else:
                                seg_seconds = 0
                            
                            if t.task_type == "work":
                                total_work_seconds += seg_seconds
                            else:
                                total_pause_seconds += seg_seconds
                        
                        session_data = {
                            "id": task.id,
                            "assignment_id": assignment.id,
                            "worker_id": assignment.user_id,
                            "worker_name": assignment.worker.full_name if assignment.worker else None,
                            "session_type": task.task_type,
                            "total_work_seconds": total_work_seconds,
                            "total_pause_seconds": total_pause_seconds,
                            "is_active": True
                        }
                        sessions_by_workspace.setdefault(task.workspace_id, []).append(session_data)
                
                # Current tick active users
                current_active_users = set()
                
                # Send to appropriate users
                for workspace_id, user_id in connected_users:
                    if (workspace_id, user_id) not in workspace_members:
                        continue
                    # Filter sessions for this user
                    if (workspace_id, user_id) in workspace_admins:
                        user_sessions = sessions_by_workspace.get(workspace_id, [])
                    else:
                        user_sessions = [
                            session
                            for session in sessions_by_workspace.get(workspace_id, [])
                            if session["worker_id"] == user_id
                        ]
                    
                    if user_sessions:
                        current_active_users.add(user_id)
                        await manager.send_to_user(user_id, workspace_id, {
                            "type": "timer_update",
                            "sessions": user_sessions,
                            "timestamp": now.isoformat()
                        })
                    elif user_id in prev_active_users:
                        # User previously had sessions, but now none. Send empty list to clear UI.
                        await manager.send_to_user(user_id, workspace_id, {
                            "type": "timer_update",
                            "sessions": [],
                            "timestamp": now.isoformat()
                        })
                
                prev_active_users = current_active_users
        
        except asyncio.CancelledError:
            logger.info("Timer broadcast task cancelled")
            break
        except Exception as e:
            logger.error(f"Timer broadcast error: {e}")
            await asyncio.sleep(5)  # Wait before retrying after error


def start_timer_broadcast():
    """Start the timer broadcast background task."""
    global _timer_task
    if _timer_task is None or _timer_task.done():
        _timer_task = asyncio.create_task(broadcast_timer_updates())
        logger.info("Timer broadcast task created")


def stop_timer_broadcast():
    """Stop the timer broadcast background task."""
    global _timer_task
    if _timer_task and not _timer_task.done():
        _timer_task.cancel()
        logger.info("Timer broadcast task stopping")
