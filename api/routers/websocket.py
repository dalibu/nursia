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
    
    async def broadcast(self, event: dict, exclude_user_id: Optional[int] = None):
        """Send event to all connected users (optionally excluding one)"""
        logger.info(f"Broadcasting event: {event}, exclude_user_id={exclude_user_id}, active_connections={list(self.active_connections.keys())}")
        message = json.dumps(event)
        disconnected = []
        
        for user_id, connections in self.active_connections.items():
            if exclude_user_id and user_id == exclude_user_id:
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
