import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

/**
 * WebSocket context for real-time updates
 */
const WebSocketContext = createContext(null);

export const useWebSocket = () => {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error('useWebSocket must be used within a WebSocketProvider');
    }
    return context;
};

/**
 * WebSocket Provider component
 * Manages connection lifecycle and provides event subscription
 */
export const WebSocketProvider = ({ children }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [lastEvent, setLastEvent] = useState(null);
    const wsRef = useRef(null);
    const subscribersRef = useRef(new Map()); // Map<eventType, Set<callback>>
    const reconnectTimeoutRef = useRef(null);
    const reconnectAttemptsRef = useRef(0);
    const maxReconnectAttempts = 5;
    const baseReconnectDelay = 1000; // ms

    const getWebSocketUrl = useCallback(() => {
        const token = localStorage.getItem('token');
        if (!token) return null;

        // For WebSocket, we need to connect directly, bypassing the proxy
        // In development (localhost), connect to localhost:8000
        // In production, use the same host as the frontend
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const hostParts = window.location.host.split(':');
        const hostname = hostParts[0];
        
        // If on localhost/127.0.0.1, connect to API on localhost:8000
        // Otherwise use the same hostname as the frontend (production)
        let host;
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            host = 'localhost:8000';
        } else {
            host = window.location.host;
        }
        
        return `${protocol}//${host}/api/ws?token=${encodeURIComponent(token)}`;
    }, []);

    const handleMessage = useCallback((event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('[WebSocket] Received:', data);
            setLastEvent(data);

            // Notify subscribers
            const eventType = data.type;
            if (eventType && subscribersRef.current.has(eventType)) {
                subscribersRef.current.get(eventType).forEach(callback => {
                    try {
                        callback(data);
                    } catch (err) {
                        console.error('[WebSocket] Subscriber error:', err);
                    }
                });
            }

            // Also notify "*" subscribers (for any event)
            if (subscribersRef.current.has('*')) {
                subscribersRef.current.get('*').forEach(callback => {
                    try {
                        callback(data);
                    } catch (err) {
                        console.error('[WebSocket] Subscriber error:', err);
                    }
                });
            }
        } catch (err) {
            console.error('[WebSocket] Failed to parse message:', err);
        }
    }, []);

    const connect = useCallback(() => {
        const url = getWebSocketUrl();
        if (!url) {
            console.log('[WebSocket] No token, skipping connection');
            return;
        }

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            console.log('[WebSocket] Already connected');
            return;
        }

        console.log('[WebSocket] Connecting...');
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('[WebSocket] Connected');
            setIsConnected(true);
            reconnectAttemptsRef.current = 0;
        };

        ws.onclose = (event) => {
            console.log('[WebSocket] Disconnected:', event.code, event.reason);
            setIsConnected(false);
            wsRef.current = null;

            // Reconnect if not intentional close
            if (event.code !== 1000 && event.code !== 4001) {
                scheduleReconnect();
            }
        };

        ws.onerror = (error) => {
            console.error('[WebSocket] Error:', error);
        };

        ws.onmessage = handleMessage;
    }, [getWebSocketUrl, handleMessage]);

    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        if (wsRef.current) {
            wsRef.current.close(1000, 'User logout');
            wsRef.current = null;
        }
        setIsConnected(false);
    }, []);

    const scheduleReconnect = useCallback(() => {
        if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
            console.log('[WebSocket] Max reconnect attempts reached');
            return;
        }

        const delay = baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
        console.log(`[WebSocket] Reconnecting in ${delay}ms...`);

        reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
        }, delay);
    }, [connect]);

    // Subscribe to specific event types
    const subscribe = useCallback((eventTypes, callback) => {
        const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];

        types.forEach(type => {
            if (!subscribersRef.current.has(type)) {
                subscribersRef.current.set(type, new Set());
            }
            subscribersRef.current.get(type).add(callback);
        });

        // Return unsubscribe function
        return () => {
            types.forEach(type => {
                if (subscribersRef.current.has(type)) {
                    subscribersRef.current.get(type).delete(callback);
                    if (subscribersRef.current.get(type).size === 0) {
                        subscribersRef.current.delete(type);
                    }
                }
            });
        };
    }, []);

    // Keep-alive ping
    useEffect(() => {
        const pingInterval = setInterval(() => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send('ping');
            }
        }, 30000); // Every 30 seconds

        return () => clearInterval(pingInterval);
    }, []);

    // Connect on mount, disconnect on unmount
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            connect();
        }

        return () => {
            disconnect();
        };
    }, [connect, disconnect]);

    // Reconnect when token changes
    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === 'token') {
                if (e.newValue) {
                    connect();
                } else {
                    disconnect();
                }
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [connect, disconnect]);

    const value = {
        isConnected,
        lastEvent,
        subscribe,
        connect,
        disconnect
    };

    return (
        <WebSocketContext.Provider value={value}>
            {children}
        </WebSocketContext.Provider>
    );
};

export default WebSocketContext;
