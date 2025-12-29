import React, { useState, useEffect, useRef } from 'react';
import { Paper, Box, Typography, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Tooltip } from '@mui/material';
import { Pause, PlayArrow, Stop, AccessTime, Coffee, DragIndicator, Add } from '@mui/icons-material';
import { useActiveSession } from '../context/ActiveSessionContext';
import { assignments as assignmentsService } from '../services/api';

function FloatingTimer() {
    const { activeSession, stopSession, togglePause, fetchActiveSession, notifySessionChange } = useActiveSession();
    // Initial position: right of logo (approximately x=230, y=12 for inside header area)
    const [position, setPosition] = useState({ x: 230, y: 12 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [localTime, setLocalTime] = useState(new Date());
    const [newTaskOpen, setNewTaskOpen] = useState(false);
    const [newTaskDescription, setNewTaskDescription] = useState('');
    const timerRef = useRef(null);

    // Update local time every second for real-time display
    useEffect(() => {
        const timer = setInterval(() => setLocalTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Handle new task creation (switch task)
    const handleNewTask = async () => {
        if (!activeSession) return;
        try {
            await assignmentsService.switchTask(activeSession.assignment_id, {
                description: newTaskDescription || null
            });
            setNewTaskOpen(false);
            setNewTaskDescription('');
            fetchActiveSession();
            notifySessionChange(); // Trigger table refresh
        } catch (error) {
            console.error('Failed to switch task:', error);
        }
    };

    // Calculate elapsed times with REAL-TIME updates (every second)
    const getDisplayTimes = () => {
        if (!activeSession) return { work: '00:00:00', pause: '00:00:00' };

        const dateTimeStr = `${activeSession.assignment_date}T${activeSession.start_time}`;
        const startTime = new Date(dateTimeStr);
        const currentSegmentSeconds = Math.max(0, Math.floor((localTime - startTime) / 1000));

        const isPaused = activeSession.session_type === 'pause';
        const apiWorkSeconds = activeSession.total_work_seconds || 0;
        const apiPauseSeconds = activeSession.total_pause_seconds || 0;

        let workSeconds, pauseSeconds;
        if (isPaused) {
            workSeconds = apiWorkSeconds;
            pauseSeconds = currentSegmentSeconds;
        } else {
            pauseSeconds = apiPauseSeconds;
            workSeconds = currentSegmentSeconds;
        }

        const formatTime = (seconds) => {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = seconds % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        };

        return { work: formatTime(workSeconds), pause: formatTime(pauseSeconds) };
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

    if (!activeSession) return null;

    const times = getDisplayTimes();
    const isPaused = activeSession.session_type === 'pause';

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
                cursor: isDragging ? 'grabbing' : 'default'
            }}
        >
            <Box
                onMouseDown={handleMouseDown}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.5,
                    py: 0.5,
                    background: isPaused
                        ? 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)'
                        : 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)',
                    color: 'white',
                    cursor: 'grab'
                }}
            >
                <DragIndicator sx={{ fontSize: 18, opacity: 0.7 }} />

                <AccessTime sx={{ fontSize: 20 }} />
                <Typography sx={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 'bold' }}>
                    {times.work}
                </Typography>

                <Typography sx={{ opacity: 0.6, fontSize: '1rem' }}>|</Typography>

                <Coffee sx={{ fontSize: 20 }} />
                <Typography sx={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 'bold' }}>
                    {times.pause}
                </Typography>

                <Tooltip title={isPaused ? 'Продолжить' : 'Пауза'}>
                    <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); togglePause(); }}
                        sx={{ p: 0.5, color: 'white', '&:hover': { backgroundColor: 'rgba(255,255,255,0.2)' } }}
                    >
                        {isPaused ? <PlayArrow sx={{ fontSize: 22 }} /> : <Pause sx={{ fontSize: 22 }} />}
                    </IconButton>
                </Tooltip>
                <Tooltip title="Завершить смену">
                    <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); stopSession(); }}
                        sx={{ p: 0.5, color: 'white', '&:hover': { backgroundColor: 'rgba(255,255,255,0.2)' } }}
                    >
                        <Stop sx={{ fontSize: 22 }} />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Новое задание">
                    <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); setNewTaskOpen(true); }}
                        sx={{ p: 0.5, color: 'white', '&:hover': { backgroundColor: 'rgba(255,255,255,0.2)' } }}
                    >
                        <Add sx={{ fontSize: 22 }} />
                    </IconButton>
                </Tooltip>
            </Box>

            {/* New Task Dialog */}
            <Dialog open={newTaskOpen} onClose={() => setNewTaskOpen(false)}>
                <DialogTitle>Новое задание</DialogTitle>
                <DialogContent sx={{ minWidth: 350 }}>
                    <TextField
                        fullWidth
                        label="Описание задания"
                        value={newTaskDescription}
                        onChange={(e) => setNewTaskDescription(e.target.value)}
                        placeholder="Что вы будете делать?"
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
