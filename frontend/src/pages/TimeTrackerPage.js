import React, { useState, useEffect, useCallback } from 'react';
import {
    Typography, Paper, Box, Button, Card, CardContent, Grid,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField, MenuItem, CircularProgress, Chip, Dialog, DialogTitle,
    DialogContent, DialogActions, Alert, IconButton
} from '@mui/material';
import {
    PlayArrow, Stop, AccessTime, Person, Work,
    Refresh, Timer
} from '@mui/icons-material';
import { workSessions, employment, contributors } from '../services/api';

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

    // Start session dialog
    const [startDialogOpen, setStartDialogOpen] = useState(false);
    const [selectedEmployment, setSelectedEmployment] = useState('');

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
            const [sessionsRes, activeRes, empRes, contribRes] = await Promise.all([
                workSessions.list({ limit: 50 }),
                workSessions.getActive(),
                employment.list({ is_active: true }),
                contributors.list()
            ]);
            setSessions(sessionsRes.data);
            setActiveSessions(activeRes.data);
            setEmploymentList(empRes.data);
            setContributorsList(contribRes.data);
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
                        onClick={() => setStartDialogOpen(true)}
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
                            <Grid item xs={12} md={6} key={session.id}>
                                <Card>
                                    <CardContent>
                                        <Box display="flex" justifyContent="space-between" alignItems="center">
                                            <Box>
                                                <Typography variant="h6">
                                                    <Person sx={{ verticalAlign: 'middle', mr: 1 }} />
                                                    {session.worker_name}
                                                </Typography>
                                                <Typography color="text.secondary">
                                                    Работодатель: {session.employer_name}
                                                </Typography>
                                                <Box display="flex" gap={2} mt={1}>
                                                    <Chip
                                                        icon={<Timer />}
                                                        label={`Начало: ${formatTime(session.start_time)}`}
                                                        size="small"
                                                    />
                                                    <Chip
                                                        icon={<AccessTime />}
                                                        label={formatDuration(session.start_time, session.session_date)}
                                                        color="primary"
                                                        size="small"
                                                    />
                                                </Box>
                                            </Box>
                                            <Button
                                                variant="contained"
                                                color="error"
                                                startIcon={<Stop />}
                                                onClick={() => handleStopSession(session.id)}
                                            >
                                                Стоп
                                            </Button>
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
                            label="Выберите работника"
                            value={selectedEmployment}
                            onChange={(e) => setSelectedEmployment(e.target.value)}
                            sx={{ mt: 2 }}
                        >
                            {employmentList.map((emp) => (
                                <MenuItem key={emp.id} value={emp.id}>
                                    {emp.employee_name} → {emp.employer_name} ({formatCurrency(emp.hourly_rate, emp.currency)}/ч)
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
        </Box>
    );
}

export default TimeTrackerPage;
