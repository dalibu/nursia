import React, { useState, useEffect, useRef } from 'react';
import { Paper, Box, Typography, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Tooltip, Divider } from '@mui/material';
import { Pause, PlayArrow, Stop, AccessTime, Coffee, DragIndicator, Add, Person } from '@mui/icons-material';
import { useActiveSession } from '../context/ActiveSessionContext';
import { assignments as assignmentsService } from '../services/api';

// Single session row component
function SessionRow({ session, onPause, onStop, onNewTask, isCompact = false }) {
    // Format elapsed time - data is already updated via WebSocket
    const getSessionTime = () => {
        const workSeconds = session.total_work_seconds || 0;
        const pauseSeconds = session.total_pause_seconds || 0;

        const formatTime = (seconds) => {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = seconds % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        };

        return { work: formatTime(workSeconds), pause: formatTime(pauseSeconds) };
    };

    const times = getSessionTime();
    const isPaused = session.session_type === 'pause';

    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: isCompact ? 0.5 : 1,
                px: isCompact ? 1 : 1.5,
                py: isCompact ? 0.25 : 0.5,
                background: isPaused
                    ? 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)'
                    : 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)',
                color: 'white',
            }}
        >
            {/* Worker name for multi-session view */}
            {session.worker_name && (
                <Tooltip title={session.worker_name}>
                    <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        maxWidth: 80,
                        overflow: 'hidden'
                    }}>
                        <Person sx={{ fontSize: 14, opacity: 0.8 }} />
                        <Typography sx={{
                            fontSize: '0.7rem',
                            opacity: 0.9,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: 60
                        }}>
                            {session.worker_name?.split(' ')[0]}
                        </Typography>
                    </Box>
                </Tooltip>
            )}

            <AccessTime sx={{ fontSize: isCompact ? 16 : 20 }} />
            <Typography sx={{
                fontFamily: 'monospace',
                fontSize: isCompact ? '0.85rem' : '1.1rem',
                fontWeight: 'bold',
                '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.6 }
                },
                animation: isPaused ? 'none' : 'pulse 1s ease-in-out infinite'
            }}>
                {times.work}
            </Typography>

            <Typography sx={{ opacity: 0.5, fontSize: '0.8rem' }}>|</Typography>

            <Coffee sx={{ fontSize: isCompact ? 14 : 18 }} />
            <Typography sx={{ fontFamily: 'monospace', fontSize: isCompact ? '0.75rem' : '1rem', fontWeight: 'bold' }}>
                {times.pause}
            </Typography>

            <Tooltip title={isPaused ? 'Продолжить' : 'Пауза'}>
                <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); onPause(session); }}
                    sx={{ p: 0.3, color: 'white', '&:hover': { backgroundColor: 'rgba(255,255,255,0.2)' } }}
                >
                    {isPaused ? <PlayArrow sx={{ fontSize: 18 }} /> : <Pause sx={{ fontSize: 18 }} />}
                </IconButton>
            </Tooltip>
            <Tooltip title="Завершить">
                <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); onStop(session); }}
                    sx={{ p: 0.3, color: 'white', '&:hover': { backgroundColor: 'rgba(255,255,255,0.2)' } }}
                >
                    <Stop sx={{ fontSize: 18 }} />
                </IconButton>
            </Tooltip>
            <Tooltip title="Новое задание">
                <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); onNewTask(session); }}
                    sx={{ p: 0.3, color: 'white', '&:hover': { backgroundColor: 'rgba(255,255,255,0.2)' } }}
                >
                    <Add sx={{ fontSize: 18 }} />
                </IconButton>
            </Tooltip>
        </Box>
    );
}

function FloatingTimer() {
    const { activeSessions, fetchActiveSession, notifySessionChange } = useActiveSession();
    // Initial position: right of logo
    const [position, setPosition] = useState({ x: 230, y: 12 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [newTaskOpen, setNewTaskOpen] = useState(false);
    const [newTaskDescription, setNewTaskDescription] = useState('');
    const [selectedSession, setSelectedSession] = useState(null);
    const timerRef = useRef(null);

    // Session actions
    const handlePauseSession = async (session) => {
        try {
            const endpoint = session.session_type === 'pause' ? 'resume' : 'pause';
            await assignmentsService[endpoint](session.id);
            fetchActiveSession();
            notifySessionChange();
        } catch (error) {
            console.error('Failed to toggle pause:', error);
        }
    };

    const handleStopSession = async (session) => {
        try {
            await assignmentsService.stop(session.id);
            fetchActiveSession();
            notifySessionChange();
        } catch (error) {
            console.error('Failed to stop session:', error);
        }
    };

    const handleNewTaskOpen = (session) => {
        setSelectedSession(session);
        setNewTaskOpen(true);
    };

    const handleNewTask = async () => {
        if (!selectedSession) return;
        try {
            await assignmentsService.switchTask(selectedSession.assignment_id, {
                description: newTaskDescription || null
            });
            setNewTaskOpen(false);
            setNewTaskDescription('');
            setSelectedSession(null);
            fetchActiveSession();
            notifySessionChange();
        } catch (error) {
            console.error('Failed to switch task:', error);
        }
    };

    // Drag handlers
    const handleMouseDown = (e) => {
        setIsDragging(true);
        setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e) => {
        if (isDragging) {
            setPosition({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
        }
    };

    const handleMouseUp = () => setIsDragging(false);

    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, dragOffset]);

    if (!activeSessions || activeSessions.length === 0) return null;

    return (
        <Paper
            ref={timerRef}
            elevation={4}
            sx={{
                position: 'fixed',
                left: position.x,
                top: position.y,
                zIndex: 9999,
                borderRadius: 1,
                overflow: 'hidden',
                userSelect: 'none',
                cursor: isDragging ? 'grabbing' : 'default',
                minWidth: activeSessions.length > 1 ? 320 : 'auto'
            }}
        >
            {/* Header with drag handle */}
            <Box
                onMouseDown={handleMouseDown}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 0.5,
                    py: 0.25,
                    background: '#333',
                    color: 'white',
                    cursor: 'grab',
                    fontSize: '0.7rem'
                }}
            >
                <DragIndicator sx={{ fontSize: 14, opacity: 0.7 }} />
                <Typography sx={{ fontSize: '0.7rem', opacity: 0.8 }}>
                    Активные сессии ({activeSessions.length})
                </Typography>
            </Box>

            {/* Sessions list - all sessions visible */}
            {activeSessions.map((session, index) => (
                <Box key={session.id}>
                    {index > 0 && <Divider sx={{ borderColor: 'rgba(255,255,255,0.2)' }} />}
                    <SessionRow
                        session={session}
                        onPause={handlePauseSession}
                        onStop={handleStopSession}
                        onNewTask={handleNewTaskOpen}
                    />
                </Box>
            ))}

            {/* New Task Dialog */}
            <Dialog open={newTaskOpen} onClose={() => setNewTaskOpen(false)}>
                <DialogTitle>
                    Новое задание
                    {selectedSession?.worker_name && (
                        <Typography variant="body2" color="text.secondary">
                            {selectedSession.worker_name}
                        </Typography>
                    )}
                </DialogTitle>
                <DialogContent sx={{ minWidth: 350 }}>
                    <TextField
                        fullWidth
                        label="Описание задания"
                        value={newTaskDescription}
                        onChange={(e) => setNewTaskDescription(e.target.value)}
                        placeholder="Что будет делать?"
                        multiline
                        rows={2}
                        sx={{ mt: 2 }}
                        autoFocus
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setNewTaskOpen(false)}>Отмена</Button>
                    <Button variant="contained" onClick={handleNewTask}>Начать</Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
}

export default FloatingTimer;
