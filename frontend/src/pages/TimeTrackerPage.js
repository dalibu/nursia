import React, { useState, useEffect, useCallback } from 'react';
import {
    Typography, Paper, Box, Button, Card, CardContent, Grid,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField, MenuItem, CircularProgress, Chip, Dialog, DialogTitle,
    DialogContent, DialogActions, Alert, IconButton, Collapse, Snackbar
} from '@mui/material';
import {
    PlayArrow, Stop, AccessTime, Person, Work,
    Refresh, Timer, Edit, Delete, Pause, Coffee,
    KeyboardArrowDown, KeyboardArrowUp, Search
} from '@mui/icons-material';
import { assignments as assignmentsService, employment as employmentService, contributors as contributorsService, payments as paymentsService } from '../services/api';
import { useActiveSession } from '../context/ActiveSessionContext';

// Символы валют
const currencySymbols = {
    'UAH': '₴',
    'EUR': '€',
    'USD': '$',
    'RUB': '₽'
};

function TimeTrackerPage() {
    const [loading, setLoading] = useState(true);
    const [groupedAssignments, setGroupedAssignments] = useState([]);
    const [activeSessions, setActiveSessions] = useState([]);
    const [employmentList, setEmploymentList] = useState([]);
    const [contributorsList, setContributorsList] = useState([]);
    const [summary, setSummary] = useState([]);
    const [period, setPeriod] = useState('month');
    const [isAdmin, setIsAdmin] = useState(false);

    // Filters
    const [filters, setFilters] = useState({
        search: '',
        worker: '',
        status: 'all',
        dateFrom: '',
        dateTo: ''
    });
    const [filteredAssignments, setFilteredAssignments] = useState([]);

    // Use shared context for active session - provides synchronized timer
    const { activeSession, getElapsedTimes, fetchActiveSession, currentTime, setOnSessionChange } = useActiveSession();

    // Register callback to refresh table when session actions happen (pause/resume/stop)
    useEffect(() => {
        setOnSessionChange(() => {
            loadData();
            loadSummary();
        });
        return () => setOnSessionChange(null);
    }, [setOnSessionChange]);

    // Start session dialog
    const [startDialogOpen, setStartDialogOpen] = useState(false);
    const [selectedEmployment, setSelectedEmployment] = useState('');

    // Edit session dialog
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editSession, setEditSession] = useState(null);
    const [editForm, setEditForm] = useState({
        assignment_date: '',
        start_time: '',
        end_time: '',
        description: ''
    });

    // Expanded rows state
    const [expandedRows, setExpandedRows] = useState({});

    // Delete confirmation dialog (for tasks)
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [sessionToDelete, setSessionToDelete] = useState(null);

    // Assignment edit dialog
    const [assignmentEditOpen, setAssignmentEditOpen] = useState(false);
    const [assignmentToEdit, setAssignmentToEdit] = useState(null);
    const [assignmentForm, setAssignmentForm] = useState({
        assignment_date: '',
        hourly_rate: '',
        currency: 'UAH',
        description: ''
    });

    // Assignment delete dialog
    const [assignmentDeleteOpen, setAssignmentDeleteOpen] = useState(false);
    const [assignmentToDelete, setAssignmentToDelete] = useState(null);

    // Snackbar for error messages
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'error' });
    const showError = (message) => setSnackbar({ open: true, message, severity: 'error' });
    const showSuccess = (message) => setSnackbar({ open: true, message, severity: 'success' });
    const closeSnackbar = () => setSnackbar({ ...snackbar, open: false });

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        loadData();
        loadSummary();
    }, [period]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [groupedRes, activeRes, empRes, contribRes, userRes] = await Promise.all([
                assignmentsService.getGrouped({ period }),
                assignmentsService.getActive(),
                employmentService.list({ is_active: true }),
                contributorsService.list(),
                paymentsService.getUserInfo()
            ]);
            setGroupedAssignments(groupedRes.data);
            setFilteredAssignments(groupedRes.data); // Initialize filtered list
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

    // Apply filters to assignments
    useEffect(() => {
        let filtered = [...groupedAssignments];

        // Search filter
        if (filters.search) {
            const searchTerm = filters.search.toLowerCase();
            filtered = filtered.filter(a => {
                // Search in assignment fields
                const assignmentFields = [
                    a.worker_name,
                    a.description,
                    a.assignment_date,
                    formatCurrency(a.total_amount, a.currency)
                ];
                const assignmentMatch = assignmentFields.some(field =>
                    field && field.toString().toLowerCase().includes(searchTerm)
                );

                // Search in task (segment) descriptions
                const taskMatch = a.segments && a.segments.some(seg =>
                    seg.description && seg.description.toLowerCase().includes(searchTerm)
                );

                return assignmentMatch || taskMatch;
            });
        }

        // Worker filter (admin only)
        if (filters.worker) {
            filtered = filtered.filter(a => a.worker_id === parseInt(filters.worker));
        }

        // Status filter
        if (filters.status === 'active') {
            filtered = filtered.filter(a => a.is_active);
        } else if (filters.status === 'completed') {
            filtered = filtered.filter(a => !a.is_active);
        }

        // Date from filter
        if (filters.dateFrom) {
            filtered = filtered.filter(a => a.assignment_date >= filters.dateFrom);
        }

        // Date to filter
        if (filters.dateTo) {
            filtered = filtered.filter(a => a.assignment_date <= filters.dateTo);
        }

        setFilteredAssignments(filtered);
    }, [groupedAssignments, filters]);

    const loadSummary = async () => {
        try {
            const res = await assignmentsService.getSummary({ period });
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
                await assignmentsService.start({
                    worker_id: emp.employee_id,
                    employer_id: emp.employer_id
                });
                loadData();
            } catch (error) {
                console.error('Failed to start session:', error);
                showError(error.response?.data?.detail || 'Ошибка при запуске сессии');
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
            await assignmentsService.start({
                worker_id: emp.employee_id,
                employer_id: emp.employer_id
            });
            setStartDialogOpen(false);
            setSelectedEmployment('');
            loadData();
        } catch (error) {
            console.error('Failed to start session:', error);
            showError(error.response?.data?.detail || 'Ошибка при запуске сессии');
        }
    };

    const handleStopSession = async (sessionId) => {
        try {
            await assignmentsService.stop(sessionId);
            loadData();
            loadSummary();
        } catch (error) {
            console.error('Failed to stop session:', error);
            showError(error.response?.data?.detail || 'Ошибка при остановке сессии');
        }
    };

    const handlePauseResume = async (session) => {
        try {
            const endpoint = session.session_type === 'pause' ? 'resume' : 'pause';
            await assignmentsService[endpoint](session.id);
            loadData();
        } catch (error) {
            console.error('Failed to toggle pause:', error);
            showError(error.response?.data?.detail || 'Ошибка при переключении паузы');
        }
    };

    const handleEditClick = (session) => {
        setEditSession(session);
        setEditForm({
            assignment_date: session.assignment_date,
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
            const response = await fetch(`/api/assignments/${editSession.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    assignment_date: editForm.assignment_date,
                    start_time: editForm.start_time ? editForm.start_time + ':00' : null,
                    end_time: editForm.end_time ? editForm.end_time + ':00' : null,
                    description: editForm.description || null
                })
            });

            if (!response.ok) {
                let errorMessage = 'Ошибка при сохранении';
                try {
                    const data = await response.json();
                    errorMessage = data.detail || errorMessage;
                } catch (e) {
                    errorMessage = await response.text();
                }
                showError(errorMessage);
                return;
            }

            setEditDialogOpen(false);
            setEditSession(null);
            loadData();
            loadSummary();
        } catch (error) {
            console.error('Failed to update session:', error);
            showError('Ошибка при сохранении');
        }
    };

    const handleDeleteClick = (sessionId, e) => {
        if (e) e.stopPropagation();
        setSessionToDelete(sessionId);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!sessionToDelete) return;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/assignments/${sessionToDelete}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                let errorMessage = 'Ошибка удаления';
                try {
                    const data = await response.json();
                    errorMessage = data.detail || errorMessage;
                } catch (e) {
                    errorMessage = await response.text();
                }
                throw new Error(errorMessage);
            }
            loadData();
            loadSummary();
        } catch (error) {
            console.error('Failed to delete session:', error);
            showError(error.message || 'Ошибка при удалении');
        } finally {
            setDeleteDialogOpen(false);
            setSessionToDelete(null);
        }
    };

    // Assignment edit handlers
    const handleEditAssignment = (assignment, e) => {
        if (e) e.stopPropagation();
        setAssignmentToEdit(assignment);
        setAssignmentForm({
            assignment_date: assignment.assignment_date,
            hourly_rate: assignment.hourly_rate || '',
            currency: assignment.currency || 'UAH',
            description: assignment.description || ''
        });
        setAssignmentEditOpen(true);
    };

    const handleSaveAssignment = async () => {
        if (!assignmentToEdit) return;
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/assignments/assignment/${assignmentToEdit.assignment_id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    assignment_date: assignmentForm.assignment_date,
                    hourly_rate: parseFloat(assignmentForm.hourly_rate),
                    currency: assignmentForm.currency,
                    description: assignmentForm.description || null
                })
            });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Ошибка сохранения');
            }
            showSuccess('Смена обновлена');
            setAssignmentEditOpen(false);
            setAssignmentToEdit(null);
            loadData();
            loadSummary();
        } catch (error) {
            showError(error.message);
        }
    };

    // Assignment delete handlers
    const handleDeleteAssignment = (assignment, e) => {
        if (e) e.stopPropagation();
        setAssignmentToDelete(assignment);
        setAssignmentDeleteOpen(true);
    };

    const handleConfirmDeleteAssignment = async () => {
        if (!assignmentToDelete) return;
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/assignments/assignment/${assignmentToDelete.assignment_id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Ошибка удаления');
            }
            showSuccess('Смена удалена');
            loadData();
            loadSummary();
        } catch (error) {
            showError(error.message);
        } finally {
            setAssignmentDeleteOpen(false);
            setAssignmentToDelete(null);
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

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        const [year, month, day] = dateStr.split('-');
        return `${day}.${month}.${year}`;
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

    // Calculate real-time session times - use context for active session, or local calculation as fallback
    const getSessionTimes = (session) => {
        // If this is the active session from context, use synchronized timer
        if (activeSession && activeSession.id === session.id) {
            return getElapsedTimes();
        }

        // Fallback for other sessions (shouldn't happen, but keep for safety)
        const dateTimeStr = `${session.assignment_date}T${session.start_time}`;
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


            {/* Active session is now shown in FloatingTimer */}

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

            {/* Filters */}
            <Paper sx={{ p: 2, mb: 2, backgroundColor: '#f5f5f5' }}>
                <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
                    <TextField
                        label="Поиск"
                        size="small"
                        value={filters.search}
                        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                        placeholder="Поиск по сменам..."
                        InputProps={{
                            startAdornment: <Search sx={{ mr: 1, color: 'action.active' }} />
                        }}
                        sx={{ minWidth: 200 }}
                    />
                    {isAdmin && (
                        <TextField
                            select
                            label="Работник"
                            size="small"
                            value={filters.worker}
                            onChange={(e) => setFilters({ ...filters, worker: e.target.value })}
                            sx={{ minWidth: 150 }}
                        >
                            <MenuItem value="">Все</MenuItem>
                            {contributorsList.map(c => (
                                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                            ))}
                        </TextField>
                    )}
                    <TextField
                        select
                        label="Статус"
                        size="small"
                        value={filters.status}
                        onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                        sx={{ minWidth: 120 }}
                    >
                        <MenuItem value="all">Все</MenuItem>
                        <MenuItem value="active">В работе</MenuItem>
                        <MenuItem value="completed">Завершено</MenuItem>
                    </TextField>
                    <TextField
                        label="Дата от"
                        type="date"
                        size="small"
                        value={filters.dateFrom}
                        onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                        InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                        label="Дата до"
                        type="date"
                        size="small"
                        value={filters.dateTo}
                        onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                        InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                        select
                        label="Период"
                        size="small"
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        sx={{ minWidth: 100 }}
                    >
                        <MenuItem value="day">День</MenuItem>
                        <MenuItem value="week">Неделя</MenuItem>
                        <MenuItem value="month">Месяц</MenuItem>
                        <MenuItem value="year">Год</MenuItem>
                    </TextField>
                    <Button
                        variant="outlined"
                        onClick={() => setFilters({ search: '', worker: '', status: 'all', dateFrom: '', dateTo: '' })}
                    >
                        Очистить
                    </Button>
                </Box>
            </Paper>

            <Paper sx={{ p: 3 }}>

                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                                <TableCell width={40}></TableCell>
                                <TableCell><strong>Дата</strong></TableCell>
                                <TableCell><strong>Работник</strong></TableCell>
                                <TableCell align="center"><strong>Время</strong></TableCell>
                                <TableCell align="right"><strong>Работа</strong></TableCell>
                                <TableCell align="right"><strong>Сумма</strong></TableCell>
                                <TableCell><strong>Описание</strong></TableCell>
                                <TableCell align="center"><strong>Статус</strong></TableCell>
                                <TableCell align="center" width={80}></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredAssignments.map((assignment) => (
                                <React.Fragment key={assignment.assignment_id}>
                                    {/* Main assignment row */}
                                    <TableRow
                                        sx={{
                                            '&:hover': { backgroundColor: '#f9f9f9' },
                                            cursor: 'pointer',
                                            backgroundColor: assignment.is_active ? '#e8f5e9' : 'inherit'
                                        }}
                                        onClick={() => setExpandedRows(prev => ({
                                            ...prev,
                                            [assignment.assignment_id]: !prev[assignment.assignment_id]
                                        }))}
                                    >
                                        <TableCell>
                                            <IconButton size="small">
                                                {expandedRows[assignment.assignment_id] ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                                            </IconButton>
                                        </TableCell>
                                        <TableCell><strong>{formatDate(assignment.assignment_date)}</strong></TableCell>
                                        <TableCell>{assignment.worker_name}</TableCell>
                                        <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                                            {formatTime(assignment.start_time)} — {assignment.end_time ? formatTime(assignment.end_time) : '...'}
                                        </TableCell>
                                        <TableCell align="right">
                                            {(() => {
                                                const totalMinutes = Math.floor(assignment.total_work_seconds / 60);
                                                const h = Math.floor(totalMinutes / 60);
                                                const m = totalMinutes % 60;
                                                const hours = (assignment.total_work_seconds / 3600).toFixed(2).replace('.', ',');
                                                return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} (${hours} ч.)`;
                                            })()}
                                        </TableCell>
                                        <TableCell align="right">
                                            {formatCurrency(assignment.total_amount, assignment.currency)}
                                        </TableCell>
                                        <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {assignment.description || '—'}
                                        </TableCell>
                                        <TableCell align="center">
                                            {assignment.is_active ? (
                                                <Chip label="В работе" color="warning" size="small" />
                                            ) : (
                                                <Chip label="Готово" color="success" size="small" />
                                            )}
                                        </TableCell>
                                        <TableCell align="center">
                                            <IconButton
                                                size="small"
                                                color="primary"
                                                onClick={(e) => handleEditAssignment(assignment, e)}
                                                title="Редактировать"
                                            >
                                                <Edit fontSize="small" />
                                            </IconButton>
                                            {!assignment.is_active && (
                                                <IconButton
                                                    size="small"
                                                    color="error"
                                                    onClick={(e) => handleDeleteAssignment(assignment, e)}
                                                    title="Удалить"
                                                >
                                                    <Delete fontSize="small" />
                                                </IconButton>
                                            )}
                                        </TableCell>
                                    </TableRow>

                                    {/* Expandable segments */}
                                    <TableRow>
                                        <TableCell colSpan={10} sx={{ p: 0, border: 0 }}>
                                            <Collapse in={expandedRows[assignment.assignment_id]} timeout="auto" unmountOnExit>
                                                <Box sx={{ m: 1, ml: 6, backgroundColor: '#fafafa', borderRadius: 1, p: 1 }}>

                                                    <Table size="small">
                                                        <TableBody>
                                                            {assignment.segments.map((seg) => (
                                                                <TableRow key={seg.id} sx={{
                                                                    backgroundColor: seg.session_type === 'pause' ? '#fff3e0' : '#e8f5e9'
                                                                }}>
                                                                    <TableCell width={80}>
                                                                        <Chip
                                                                            label={seg.session_type === 'pause' ? 'Пауза' : 'Работа'}
                                                                            size="small"
                                                                            sx={{
                                                                                backgroundColor: seg.session_type === 'pause' ? '#ff9800' : '#4caf50',
                                                                                color: 'white'
                                                                            }}
                                                                        />
                                                                    </TableCell>
                                                                    <TableCell>{formatTime(seg.start_time)} — {seg.end_time ? formatTime(seg.end_time) : 'сейчас'}</TableCell>
                                                                    <TableCell>
                                                                        {seg.duration_hours ? (
                                                                            (() => {
                                                                                const totalMinutes = Math.round(seg.duration_hours * 60);
                                                                                const h = Math.floor(totalMinutes / 60);
                                                                                const m = totalMinutes % 60;
                                                                                return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                                                                            })()
                                                                        ) : '—'}
                                                                    </TableCell>
                                                                    <TableCell sx={{ fontStyle: 'italic', color: '#666' }}>
                                                                        {seg.description || ''}
                                                                    </TableCell>
                                                                    <TableCell align="right">
                                                                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleEditClick(seg); }}>
                                                                            <Edit fontSize="small" />
                                                                        </IconButton>
                                                                        <IconButton size="small" color="error" onClick={(e) => handleDeleteClick(seg.id, e)}>
                                                                            <Delete fontSize="small" />
                                                                        </IconButton>
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </Box>
                                            </Collapse>
                                        </TableCell>
                                    </TableRow>
                                </React.Fragment>
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

            {/* Edit Task Dialog */}
            <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)}>
                <DialogTitle>Редактировать задание</DialogTitle>
                <DialogContent sx={{ minWidth: 400 }}>
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

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteDialogOpen}
                onClose={() => setDeleteDialogOpen(false)}
                PaperProps={{
                    sx: {
                        borderRadius: 3,
                        minWidth: 350
                    }
                }}
            >
                <DialogTitle sx={{
                    background: 'linear-gradient(135deg, #ff5252 0%, #f44336 100%)',
                    color: 'white',
                    fontWeight: 'bold'
                }}>
                    🗑️ Удаление сегмента
                </DialogTitle>
                <DialogContent sx={{ pt: 3, pb: 2, textAlign: 'center' }}>
                    <Typography variant="body1" sx={{ mb: 1 }}>
                        Вы уверены, что хотите удалить этот сегмент?
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Это действие нельзя отменить.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'center', pb: 2, gap: 1 }}>
                    <Button
                        variant="outlined"
                        onClick={() => setDeleteDialogOpen(false)}
                        sx={{ borderRadius: 2, minWidth: 100 }}
                    >
                        Отмена
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={handleDeleteConfirm}
                        sx={{ borderRadius: 2, minWidth: 100 }}
                    >
                        Удалить
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Assignment Edit Dialog */}
            <Dialog open={assignmentEditOpen} onClose={() => setAssignmentEditOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{
                    background: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)',
                    color: 'white',
                    fontWeight: 'bold'
                }}>
                    ✏️ Редактировать смену
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    <TextField
                        fullWidth
                        label="Дата"
                        type="date"
                        value={assignmentForm.assignment_date}
                        onChange={(e) => setAssignmentForm({ ...assignmentForm, assignment_date: e.target.value })}
                        sx={{ mb: 2 }}
                        InputLabelProps={{ shrink: true }}
                    />
                    <Box display="flex" gap={2} sx={{ mb: 2 }}>
                        <TextField
                            fullWidth
                            label="Ставка за час"
                            type="number"
                            value={assignmentForm.hourly_rate}
                            onChange={(e) => setAssignmentForm({ ...assignmentForm, hourly_rate: e.target.value })}
                        />
                        <TextField
                            select
                            label="Валюта"
                            value={assignmentForm.currency}
                            onChange={(e) => setAssignmentForm({ ...assignmentForm, currency: e.target.value })}
                            sx={{ minWidth: 100 }}
                        >
                            {['UAH', 'EUR', 'USD'].map((curr) => (
                                <MenuItem key={curr} value={curr}>
                                    {currencySymbols[curr] || curr}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Box>
                    <TextField
                        fullWidth
                        label="Описание"
                        multiline
                        rows={3}
                        value={assignmentForm.description}
                        onChange={(e) => setAssignmentForm({ ...assignmentForm, description: e.target.value })}
                        placeholder="Комментарий к рабочему дню..."
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setAssignmentEditOpen(false)}>Отмена</Button>
                    <Button variant="contained" onClick={handleSaveAssignment}>Сохранить</Button>
                </DialogActions>
            </Dialog>

            {/* Assignment Delete Dialog */}
            <Dialog open={assignmentDeleteOpen} onClose={() => setAssignmentDeleteOpen(false)}>
                <DialogTitle sx={{
                    background: 'linear-gradient(135deg, #ff5252 0%, #f44336 100%)',
                    color: 'white',
                    fontWeight: 'bold'
                }}>
                    🗑️ Удалить смену
                </DialogTitle>
                <DialogContent sx={{ pt: 3, pb: 2, textAlign: 'center' }}>
                    <Typography variant="body1" sx={{ mb: 1 }}>
                        Вы уверены, что хотите удалить эту смену?
                    </Typography>
                    <Typography variant="body2" color="error" sx={{ fontWeight: 'bold' }}>
                        Все задания будут удалены!
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'center', pb: 2, gap: 1 }}>
                    <Button variant="outlined" onClick={() => setAssignmentDeleteOpen(false)}>Отмена</Button>
                    <Button variant="contained" color="error" onClick={handleConfirmDeleteAssignment}>
                        Удалить всё
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar for notifications */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={closeSnackbar}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert onClose={closeSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}

export default TimeTrackerPage;
