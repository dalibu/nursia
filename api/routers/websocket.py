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
    """Manages WebSocket connections for all users"""
    
    def __init__(self):
        # user_id -> list of websocket connections (user can have multiple tabs)
        self.active_connections: Dict[int, List[WebSocket]] = {}
        # Track which users need timer updates (have active sessions)
        self.timer_subscriptions: Dict[int, bool] = {}
    
    async def connect(self, websocket: WebSocket, user_id: int):
        """Accept connection and register it"""
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        logger.info(f"WebSocket connected: user_id={user_id}, total connections={self.get_total_connections()}")
    
    def disconnect(self, websocket: WebSocket, user_id: int):
        """Remove connection from registry"""
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.info(f"WebSocket disconnected: user_id={user_id}, total connections={self.get_total_connections()}")
    
    def get_total_connections(self) -> int:
        """Get total number of active connections"""
        return sum(len(conns) for conns in self.active_connections.values())
    
    def get_connected_user_ids(self) -> List[int]:
        """Get list of all connected user IDs"""
        return list(self.active_connections.keys())
    
    async def broadcast(self, event: dict, user_ids: Optional[List[int]] = None, exclude_user_id: Optional[int] = None):
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
        recipients = user_ids if user_ids is not None else self.active_connections.keys()
        
        for user_id in list(recipients):
            if exclude_user_id and user_id == exclude_user_id:
                continue
            
            connections = self.active_connections.get(user_id)
            if not connections:
                continue
                
            for websocket in connections:
                try:
                    await websocket.send_text(message)
                except Exception as e:
                    logger.warning(f"Failed to send to user {user_id}: {e}")
                    disconnected.append((websocket, user_id))
        
        # Clean up failed connections
        for websocket, user_id in disconnected:
            self.disconnect(websocket, user_id)
    
    async def send_to_user(self, user_id: int, event: dict):
        """Send event to specific user (all their connections)"""
        if user_id not in self.active_connections:
            return
        
        message = json.dumps(event)
        disconnected = []
        
        for websocket in self.active_connections[user_id]:
            try:
                await websocket.send_text(message)
            except Exception as e:
                logger.warning(f"Failed to send to user {user_id}: {e}")
                disconnected.append(websocket)
        
        for websocket in disconnected:
            self.disconnect(websocket, user_id)


# Global manager instance
manager = ConnectionManager()


def get_user_id_from_token(token: str) -> Optional[int]:
    """Extract user_id from JWT token"""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id:
            return int(user_id)
    except JWTError as e:
        logger.warning(f"JWT decode error: {e}")
    return None


async def get_admin_ids() -> List[int]:
    """Get IDs of all users with admin role"""
    from database.core import AsyncSessionLocal
    from database.models import User, Role
    from sqlalchemy import select
    
    async with AsyncSessionLocal() as db:
        query = select(User.id).join(User.roles).where(Role.name == 'admin')
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
    user_id = get_user_id_from_token(token)
    if not user_id:
        await websocket.close(code=4001, reason="Invalid token")
        return
    
    await manager.connect(websocket, user_id)
    
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
        manager.disconnect(websocket, user_id)
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        manager.disconnect(websocket, user_id)


# Timer broadcast task
import asyncio
from datetime import datetime

_timer_task = None

async def broadcast_timer_updates():
    """Background task that broadcasts timer updates every second to connected clients."""
    from database.core import AsyncSessionLocal
    from database.models import Task, Assignment, User
    from sqlalchemy import select
    from sqlalchemy.orm import joinedload
    from utils.timeutil import now_server
    
    logger.info("Timer broadcast task started")
    
    # Track users who received active sessions in the last tick
    # user_id -> has_active
    prev_active_users = set()
    
    while True:
        try:
            await asyncio.sleep(1)
            
            # Skip if no connections
            if manager.get_total_connections() == 0:
                prev_active_users.clear()
                continue
            
            connected_users = manager.get_connected_user_ids()
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
                sessions_data = []
                admin_users = set()  # Track admin users who should see all sessions
                
                # Get admin user IDs from connected users
                for user_id in connected_users:
                    user_result = await db.execute(
                        select(User).options(joinedload(User.roles)).where(User.id == user_id)
                    )
                    user = user_result.unique().scalar_one_or_none()
                    if user and any(r.name == 'admin' for r in user.roles):
                        admin_users.add(user_id)
                
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
                        sessions_data.append(session_data)
                
                # Current tick active users
                current_active_users = set()
                
                # Send to appropriate users
                for user_id in connected_users:
                    # Filter sessions for this user
                    if user_id in admin_users:
                        # Admin sees all sessions
                        user_sessions = sessions_data
                    else:
                        # Regular user sees only their own
                        user_sessions = [s for s in sessions_data if s["worker_id"] == user_id]
                    
                    if user_sessions:
                        current_active_users.add(user_id)
                        await manager.send_to_user(user_id, {
                            "type": "timer_update",
                            "sessions": user_sessions,
                            "timestamp": now.isoformat()
                        })
                    elif user_id in prev_active_users:
                        # User previously had sessions, but now none. Send empty list to clear UI.
                        await manager.send_to_user(user_id, {
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
