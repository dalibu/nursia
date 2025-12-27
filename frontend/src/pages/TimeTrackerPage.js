import React, { useState, useEffect, useCallback } from 'react';
import {
    Typography, Paper, Box, Button, Card, CardContent, Grid,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField, MenuItem, CircularProgress, Chip, Dialog, DialogTitle,
    DialogContent, DialogActions, Alert, IconButton
} from '@mui/material';
import {
    PlayArrow, Stop, AccessTime, Person, Work,
    Refresh, Timer, Edit, Delete, Pause, Coffee
} from '@mui/icons-material';
import { workSessions, employment, contributors, payments } from '../services/api';

// Символы валют
const currencySymbols = {
    'UAH': '₴',
    'EUR': '€',
    'USD': '$',
    'RUB': '₽'
};

function TimeTrackerPage() {
    const [loading, setLoading] = useState(true);
    const [sessions, setSessions] = useState([]);
    const [activeSessions, setActiveSessions] = useState([]);
    const [employmentList, setEmploymentList] = useState([]);
    const [contributorsList, setContributorsList] = useState([]);
    const [summary, setSummary] = useState([]);
    const [period, setPeriod] = useState('month');
    const [isAdmin, setIsAdmin] = useState(false);

    // Start session dialog
    const [startDialogOpen, setStartDialogOpen] = useState(false);
    const [selectedEmployment, setSelectedEmployment] = useState('');

    // Edit session dialog
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editSession, setEditSession] = useState(null);
    const [editForm, setEditForm] = useState({
        session_date: '',
        start_time: '',
        end_time: '',
        description: ''
    });

    // Timer for active sessions
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        loadData();
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        loadSummary();
    }, [period]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [sessionsRes, activeRes, empRes, contribRes, userRes] = await Promise.all([
                workSessions.list({ limit: 50 }),
                workSessions.getActive(),
                employment.list({ is_active: true }),
                contributors.list(),
                payments.getUserInfo()
            ]);
            setSessions(sessionsRes.data);
            setActiveSessions(activeRes.data);
            setEmploymentList(empRes.data);
            setContributorsList(contribRes.data);
            setIsAdmin(userRes.data.role === 'admin');
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadSummary = async () => {
        try {
            const res = await workSessions.getSummary({ period });
            setSummary(res.data);
        } catch (error) {
            console.error('Failed to load summary:', error);
        }
    };

    const handleStartClick = async () => {
        // Для обычного пользователя с одним трудовым отношением — сразу старт
        if (!isAdmin && employmentList.length === 1) {
            const emp = employmentList[0];
            try {
                await workSessions.start({
                    worker_id: emp.employee_id,
                    employer_id: emp.employer_id
                });
                loadData();
            } catch (error) {
                console.error('Failed to start session:', error);
                alert(error.response?.data?.detail || 'Ошибка при запуске сессии');
            }
        } else {
            // Для админа или при нескольких отношениях — показываем диалог
            setStartDialogOpen(true);
        }
    };

    const handleStartSession = async () => {
        if (!selectedEmployment) return;

        const emp = employmentList.find(e => e.id === selectedEmployment);
        try {
            await workSessions.start({
                worker_id: emp.employee_id,
                employer_id: emp.employer_id
            });
            setStartDialogOpen(false);
            setSelectedEmployment('');
            loadData();
        } catch (error) {
            console.error('Failed to start session:', error);
            alert(error.response?.data?.detail || 'Ошибка при запуске сессии');
        }
    };

    const handleStopSession = async (sessionId) => {
        try {
            await workSessions.stop(sessionId);
            loadData();
            loadSummary();
        } catch (error) {
            console.error('Failed to stop session:', error);
            alert(error.response?.data?.detail || 'Ошибка при остановке сессии');
        }
    };

    const handlePauseResume = async (session) => {
        try {
            const endpoint = session.session_type === 'pause' ? 'resume' : 'pause';
            await workSessions[endpoint](session.id);
            loadData();
        } catch (error) {
            console.error('Failed to toggle pause:', error);
            alert(error.response?.data?.detail || 'Ошибка при переключении паузы');
        }
    };

    const handleEditClick = (session) => {
        setEditSession(session);
        setEditForm({
            session_date: session.session_date,
            start_time: session.start_time?.substring(0, 5) || '',
            end_time: session.end_time?.substring(0, 5) || '',
            description: session.description || ''
        });
        setEditDialogOpen(true);
    };

    const handleEditSave = async () => {
        if (!editSession) return;

        try {
            const token = localStorage.getItem('token');
            await fetch(`/api/work-sessions/${editSession.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    session_date: editForm.session_date,
                    start_time: editForm.start_time ? editForm.start_time + ':00' : null,
                    end_time: editForm.end_time ? editForm.end_time + ':00' : null,
                    description: editForm.description || null
                })
            });
            setEditDialogOpen(false);
            setEditSession(null);
            loadData();
            loadSummary();
        } catch (error) {
            console.error('Failed to update session:', error);
            alert('Ошибка при сохранении');
        }
    };

    const handleDeleteSession = async (sessionId) => {
        if (!window.confirm('Удалить эту сессию?')) return;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/work-sessions/${sessionId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Ошибка');
            }
            loadData();
            loadSummary();
        } catch (error) {
            console.error('Failed to delete session:', error);
            alert(error.message || 'Ошибка при удалении');
        }
    };

    const formatCurrency = (amount, currency = 'UAH') => {
        const symbol = currencySymbols[currency] || currency;
        return `${symbol}${Number(amount).toLocaleString('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    };

    const formatTime = (timeStr) => {
        if (!timeStr) return '—';
        return timeStr.substring(0, 5);
    };

    const formatDuration = (startTime, startDate) => {
        const now = currentTime;
        const start = new Date(`${startDate}T${startTime}`);
        const diff = Math.floor((now - start) / 1000);

        const hours = Math.floor(diff / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        const seconds = diff % 60;

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    // Calculate real-time session times (same logic as header)
    const getSessionTimes = (session) => {
        const dateTimeStr = `${session.session_date}T${session.start_time}`;
        const start = new Date(dateTimeStr);
        const now = currentTime;
        const currentSegmentSeconds = Math.max(0, Math.floor((now - start) / 1000));

        let workSeconds = session.total_work_seconds || 0;
        let pauseSeconds = session.total_pause_seconds || 0;

        if (session.session_type === 'pause') {
            pauseSeconds += currentSegmentSeconds;
        } else {
            workSeconds += currentSegmentSeconds;
        }

        const formatSecs = (s) => {
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            const sec = s % 60;
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        };

        return { work: formatSecs(workSeconds), pause: formatSecs(pauseSeconds) };
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h4" sx={{ fontWeight: 600, color: '#1a237e' }}>
                    ⏱️ Учёт времени
                </Typography>
                <Box display="flex" gap={2}>
                    <IconButton onClick={loadData} color="primary">
                        <Refresh />
                    </IconButton>
                    <Button
                        variant="contained"
                        color="success"
                        startIcon={<PlayArrow />}
                        onClick={handleStartClick}
                        disabled={employmentList.length === 0}
                    >
                        Начать работу
                    </Button>
                </Box>
            </Box>

            {/* Active Sessions */}
            {activeSessions.length > 0 && (
                <Paper sx={{ p: 3, mb: 4, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                    <Typography variant="h6" sx={{ color: 'white', mb: 2 }}>
                        🟢 Активные сессии
                    </Typography>
                    <Grid container spacing={2}>
                        {activeSessions.map((session) => (
                            <Grid item xs={12} key={session.id}>
                                <Card sx={{
                                    backgroundColor: session.session_type === 'pause' ? '#fff3e0' : '#e8f5e9',
                                    border: session.session_type === 'pause' ? '2px solid #ff9800' : '2px solid #4caf50'
                                }}>
                                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                        <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                                            {/* Name & Status */}
                                            <Box display="flex" alignItems="center" gap={1}>
                                                <Person />
                                                <Typography variant="subtitle1" fontWeight="bold">{session.worker_name}</Typography>
                                                {session.session_type === 'pause' && (
                                                    <Chip label="ПАУЗА" size="small" sx={{ backgroundColor: '#ff9800', color: 'white' }} />
                                                )}
                                            </Box>

                                            {/* Timers */}
                                            <Box display="flex" alignItems="center" gap={2} sx={{ fontFamily: 'monospace', fontSize: '1rem' }}>
                                                <Box display="flex" alignItems="center" gap={0.5}>
                                                    <AccessTime sx={{ color: '#4caf50', fontSize: 18 }} />
                                                    <Typography sx={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#4caf50' }}>
                                                        {getSessionTimes(session).work}
                                                    </Typography>
                                                </Box>
                                                <Box display="flex" alignItems="center" gap={0.5}>
                                                    <Coffee sx={{ color: '#ff9800', fontSize: 18 }} />
                                                    <Typography sx={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#ff9800' }}>
                                                        {getSessionTimes(session).pause}
                                                    </Typography>
                                                </Box>
                                            </Box>

                                            {/* Buttons */}
                                            <Box display="flex" gap={1}>
                                                <Button
                                                    size="small"
                                                    variant="contained"
                                                    color={session.session_type === 'pause' ? 'success' : 'warning'}
                                                    startIcon={session.session_type === 'pause' ? <PlayArrow /> : <Pause />}
                                                    onClick={() => handlePauseResume(session)}
                                                >
                                                    {session.session_type === 'pause' ? 'Продолжить' : 'Пауза'}
                                                </Button>
                                                <Button
                                                    size="small"
                                                    variant="contained"
                                                    color="error"
                                                    startIcon={<Stop />}
                                                    onClick={() => handleStopSession(session.id)}
                                                >
                                                    Стоп
                                                </Button>
                                            </Box>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                </Paper>
            )}

            {/* Summary Cards */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                {summary.map((s, index) => (
                    <Grid item xs={12} sm={4} key={index}>
                        <Card sx={{
                            background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                            color: 'white'
                        }}>
                            <CardContent>
                                <Typography variant="subtitle2">За период ({period})</Typography>
                                <Box display="flex" justifyContent="space-between" mt={1}>
                                    <Box>
                                        <Typography variant="h4">{s.total_sessions}</Typography>
                                        <Typography variant="caption">сессий</Typography>
                                    </Box>
                                    <Box>
                                        <Typography variant="h4">{s.total_hours.toFixed(1)}</Typography>
                                        <Typography variant="caption">часов</Typography>
                                    </Box>
                                    <Box>
                                        <Typography variant="h4">{formatCurrency(s.total_amount, s.currency)}</Typography>
                                        <Typography variant="caption">заработано</Typography>
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            {/* Period filter */}
            <Paper sx={{ p: 3 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h6">
                        <Work sx={{ verticalAlign: 'middle', mr: 1 }} />
                        История сессий
                    </Typography>
                    <TextField
                        select
                        size="small"
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        sx={{ minWidth: 120 }}
                    >
                        <MenuItem value="day">День</MenuItem>
                        <MenuItem value="week">Неделя</MenuItem>
                        <MenuItem value="month">Месяц</MenuItem>
                        <MenuItem value="year">Год</MenuItem>
                    </TextField>
                </Box>

                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                                <TableCell><strong>Дата</strong></TableCell>
                                <TableCell><strong>Работник</strong></TableCell>
                                <TableCell align="center"><strong>Начало</strong></TableCell>
                                <TableCell align="center"><strong>Конец</strong></TableCell>
                                <TableCell align="right"><strong>Часы</strong></TableCell>
                                <TableCell align="right"><strong>Ставка</strong></TableCell>
                                <TableCell align="right"><strong>Сумма</strong></TableCell>
                                <TableCell align="center"><strong>Статус</strong></TableCell>
                                <TableCell align="center"><strong></strong></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {sessions.map((session) => (
                                <TableRow
                                    key={session.id}
                                    sx={{ '&:hover': { backgroundColor: '#f9f9f9' } }}
                                >
                                    <TableCell>
                                        <strong>{session.session_date}</strong>
                                    </TableCell>
                                    <TableCell>{session.worker_name}</TableCell>
                                    <TableCell align="center">{formatTime(session.start_time)}</TableCell>
                                    <TableCell align="center">{formatTime(session.end_time)}</TableCell>
                                    <TableCell align="right">
                                        {session.duration_hours ? session.duration_hours.toFixed(2) : '—'}
                                    </TableCell>
                                    <TableCell align="right">
                                        {formatCurrency(session.hourly_rate, session.currency)}/ч
                                    </TableCell>
                                    <TableCell align="right">
                                        {session.amount ? formatCurrency(session.amount, session.currency) : '—'}
                                    </TableCell>
                                    <TableCell align="center">
                                        {session.is_active ? (
                                            <Chip label="В работе" color="warning" size="small" />
                                        ) : (
                                            <Chip label="Завершено" color="success" size="small" />
                                        )}
                                    </TableCell>
                                    <TableCell align="center">
                                        <IconButton
                                            size="small"
                                            onClick={() => handleEditClick(session)}
                                            title="Редактировать"
                                        >
                                            <Edit fontSize="small" />
                                        </IconButton>
                                        <IconButton
                                            size="small"
                                            onClick={() => handleDeleteSession(session.id)}
                                            title="Удалить"
                                            color="error"
                                        >
                                            <Delete fontSize="small" />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            {/* Start Session Dialog */}
            <Dialog open={startDialogOpen} onClose={() => setStartDialogOpen(false)}>
                <DialogTitle>Начать рабочую сессию</DialogTitle>
                <DialogContent sx={{ minWidth: 400 }}>
                    {employmentList.length === 0 ? (
                        <Alert severity="warning" sx={{ mt: 2 }}>
                            Нет активных трудовых отношений. Сначала создайте их в настройках.
                        </Alert>
                    ) : (
                        <TextField
                            select
                            fullWidth
                            label={isAdmin ? "Выберите работника" : "Выберите работодателя"}
                            value={selectedEmployment}
                            onChange={(e) => setSelectedEmployment(e.target.value)}
                            sx={{ mt: 2 }}
                        >
                            {employmentList.map((emp) => (
                                <MenuItem key={emp.id} value={emp.id}>
                                    {isAdmin
                                        ? `${emp.employee_name} → ${emp.employer_name} (${formatCurrency(emp.hourly_rate, emp.currency)}/ч)`
                                        : `${emp.employer_name} (${formatCurrency(emp.hourly_rate, emp.currency)}/ч)`
                                    }
                                </MenuItem>
                            ))}
                        </TextField>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setStartDialogOpen(false)}>Отмена</Button>
                    <Button
                        variant="contained"
                        onClick={handleStartSession}
                        disabled={!selectedEmployment}
                    >
                        Начать
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Edit Session Dialog */}
            <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)}>
                <DialogTitle>Редактировать сессию</DialogTitle>
                <DialogContent sx={{ minWidth: 400 }}>
                    <TextField
                        fullWidth
                        type="date"
                        label="Дата"
                        value={editForm.session_date}
                        onChange={(e) => setEditForm({ ...editForm, session_date: e.target.value })}
                        sx={{ mt: 2 }}
                        InputLabelProps={{ shrink: true }}
                    />
                    <Box display="flex" gap={2} mt={2}>
                        <TextField
                            type="time"
                            label="Начало"
                            value={editForm.start_time}
                            onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })}
                            InputLabelProps={{ shrink: true }}
                            sx={{ flex: 1 }}
                        />
                        <TextField
                            type="time"
                            label="Конец"
                            value={editForm.end_time}
                            onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })}
                            InputLabelProps={{ shrink: true }}
                            sx={{ flex: 1 }}
                        />
                    </Box>
                    <TextField
                        fullWidth
                        label="Описание"
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        sx={{ mt: 2 }}
                        multiline
                        rows={2}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditDialogOpen(false)}>Отмена</Button>
                    <Button variant="contained" onClick={handleEditSave}>
                        Сохранить
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

export default TimeTrackerPage;
