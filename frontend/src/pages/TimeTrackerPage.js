import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useWebSocket } from '../contexts/WebSocketContext';
import {
    Typography, Paper, Box, Button, Card, CardContent, Grid,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel,
    TextField, MenuItem, CircularProgress, Chip, Dialog, DialogTitle,
    DialogContent, DialogActions, Alert, IconButton, Collapse, Snackbar, ListSubheader,
    Popover, Tooltip
} from '@mui/material';
import { DateRangePicker } from 'react-date-range';
import { ru } from 'date-fns/locale';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, addDays, addMonths } from 'date-fns';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import {
    PlayArrow, Stop, AccessTime, Person, Work, Add,
    Refresh, Timer, Edit, Delete, Pause, Coffee,
    KeyboardArrowDown, KeyboardArrowUp, Search, DateRange
} from '@mui/icons-material';
import { assignments as assignmentsService, employment as employmentService, payments as paymentsService } from '../services/api';
import { useActiveSession } from '../context/ActiveSessionContext';

// Russian localized static ranges for DateRangePicker
const ruStaticRanges = [
    { label: 'Сегодня', range: () => ({ startDate: new Date(), endDate: new Date() }), isSelected: () => false },
    { label: 'Вчера', range: () => ({ startDate: addDays(new Date(), -1), endDate: addDays(new Date(), -1) }), isSelected: () => false },
    { label: 'Эта неделя', range: () => ({ startDate: startOfWeek(new Date(), { weekStartsOn: 1 }), endDate: endOfWeek(new Date(), { weekStartsOn: 1 }) }), isSelected: () => false },
    { label: 'Прошлая неделя', range: () => ({ startDate: startOfWeek(addDays(new Date(), -7), { weekStartsOn: 1 }), endDate: endOfWeek(addDays(new Date(), -7), { weekStartsOn: 1 }) }), isSelected: () => false },
    { label: 'Этот месяц', range: () => ({ startDate: startOfMonth(new Date()), endDate: endOfMonth(new Date()) }), isSelected: () => false },
    { label: 'Прошлый месяц', range: () => ({ startDate: startOfMonth(addMonths(new Date(), -1)), endDate: endOfMonth(addMonths(new Date(), -1)) }), isSelected: () => false },
    { label: 'Этот год', range: () => ({ startDate: startOfYear(new Date()), endDate: endOfYear(new Date()) }), isSelected: () => false }
];

// Helper to format Date to YYYY-MM-DD without timezone issues
const toLocalDateString = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Символы валют
const currencySymbols = {
    'UAH': '₴',
    'EUR': '€',
    'USD': '$'
};

// Helper to parse date from URL string
const parseDateFromUrl = (dateStr) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
};

// Storage key for persisting filters
const FILTERS_STORAGE_KEY = 'timetracker_filters';

function TimeTrackerPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [groupedAssignments, setGroupedAssignments] = useState([]);
    const [activeSessions, setActiveSessions] = useState([]);
    const [employmentList, setEmploymentList] = useState([]);
    const [summary, setSummary] = useState([]);
    const [period, setPeriod] = useState('month');
    const [isAdmin, setIsAdmin] = useState(false);

    // Initialize filters from URL params or localStorage
    const [filters, setFilters] = useState(() => {
        // First try URL params
        const urlSearch = searchParams.get('search');
        const urlWorker = searchParams.get('worker');
        const urlStatus = searchParams.get('status');

        if (urlSearch || urlWorker || urlStatus) {
            return {
                search: urlSearch || '',
                worker: urlWorker || '',
                status: urlStatus || 'all'
            };
        }

        // Fallback to localStorage
        try {
            const stored = localStorage.getItem(FILTERS_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                return {
                    search: parsed.search || '',
                    worker: parsed.worker || '',
                    status: parsed.status || 'all'
                };
            }
        } catch (e) { }

        return { search: '', worker: '', status: 'all' };
    });

    const [dateRange, setDateRange] = useState(() => {
        // First try URL params
        const fromParam = searchParams.get('from');
        const toParam = searchParams.get('to');
        if (fromParam || toParam) {
            return [{
                startDate: parseDateFromUrl(fromParam),
                endDate: parseDateFromUrl(toParam),
                key: 'selection'
            }];
        }

        // Fallback to localStorage
        try {
            const stored = localStorage.getItem(FILTERS_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.from || parsed.to) {
                    return [{
                        startDate: parseDateFromUrl(parsed.from),
                        endDate: parseDateFromUrl(parsed.to),
                        key: 'selection'
                    }];
                }
            }
        } catch (e) { }

        return [{
            startDate: startOfMonth(new Date()),
            endDate: endOfMonth(new Date()),
            key: 'selection'
        }];
    });
    const [dateRangeAnchor, setDateRangeAnchor] = useState(null);
    const [filteredAssignments, setFilteredAssignments] = useState([]);
    const [sortField, setSortField] = useState('assignment_date');
    const [sortDirection, setSortDirection] = useState('desc');

    // Use shared context for active session - provides synchronized timer and optimistic updates
    const { activeSession, getElapsedTimes, fetchActiveSession, currentTime, setOnSessionChange, notifySessionChange, stopSession, togglePause } = useActiveSession();

    // Register callback to refresh table when session actions happen (pause/resume/stop)
    useEffect(() => {
        setOnSessionChange(() => {
            loadData(true); // Silent refresh - no loading spinner
            loadSummary();
        });
        return () => setOnSessionChange(null);
    }, [setOnSessionChange]);

    // Start session dialog
    const [startDialogOpen, setStartDialogOpen] = useState(false);
    const [selectedEmployment, setSelectedEmployment] = useState('');
    const [startDescription, setStartDescription] = useState('');
    const [startTaskDescription, setStartTaskDescription] = useState('');

    // New task dialog (for switching tasks)
    const [newTaskOpen, setNewTaskOpen] = useState(false);
    const [newTaskDescription, setNewTaskDescription] = useState('');

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

    // Sync filters to URL params AND localStorage
    useEffect(() => {
        const params = new URLSearchParams();
        const storageData = {};

        if (filters.search) {
            params.set('search', filters.search);
            storageData.search = filters.search;
        }
        if (filters.worker) {
            params.set('worker', filters.worker);
            storageData.worker = filters.worker;
        }
        if (filters.status && filters.status !== 'all') {
            params.set('status', filters.status);
            storageData.status = filters.status;
        }
        if (dateRange[0].startDate) {
            const fromStr = toLocalDateString(dateRange[0].startDate);
            params.set('from', fromStr);
            storageData.from = fromStr;
        }
        if (dateRange[0].endDate) {
            const toStr = toLocalDateString(dateRange[0].endDate);
            params.set('to', toStr);
            storageData.to = toStr;
        }

        setSearchParams(params, { replace: true });
        localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(storageData));
    }, [filters, dateRange, setSearchParams]);
    const showSuccess = (message) => setSnackbar({ open: true, message, severity: 'success' });
    const closeSnackbar = () => setSnackbar({ ...snackbar, open: false });

    // Track previous session ID to detect changes
    const prevSessionIdRef = React.useRef(activeSession?.id);

    useEffect(() => {
        loadData();
    }, []);

    const { subscribe } = useWebSocket();

    const loadData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [groupedRes, activeRes, empRes, userRes] = await Promise.all([
                assignmentsService.getGrouped({ period }),
                assignmentsService.getActive(),
                employmentService.list({ is_active: true }),
                paymentsService.getUserInfo()
            ]);
            setGroupedAssignments(groupedRes.data);
            setFilteredAssignments(groupedRes.data); // Initialize filtered list
            setActiveSessions(activeRes.data);
            setEmploymentList(empRes.data);
            setIsAdmin(userRes.data.roles?.includes('admin') || userRes.data.role === 'admin');
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [period]);

    // Apply filters to assignments
    useEffect(() => {
        let filtered = [...groupedAssignments];

        // Search filter
        if (filters.search) {
            const searchTerm = filters.search.toLowerCase();
            filtered = filtered.filter(a => {
                // Search in assignment fields
                const assignmentFields = [
                    a.tracking_nr,
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

        // Date range filter
        if (dateRange[0].startDate) {
            const startStr = toLocalDateString(dateRange[0].startDate);
            filtered = filtered.filter(a => a.assignment_date >= startStr);
        }
        if (dateRange[0].endDate) {
            const endStr = toLocalDateString(dateRange[0].endDate);
            filtered = filtered.filter(a => a.assignment_date <= endStr);
        }

        // Apply sorting
        filtered.sort((a, b) => {
            let aVal, bVal;
            switch (sortField) {
                case 'assignment_date':
                    aVal = a.assignment_date;
                    bVal = b.assignment_date;
                    break;
                case 'worker_name':
                    aVal = a.worker_name || '';
                    bVal = b.worker_name || '';
                    break;
                case 'total_work_seconds':
                    aVal = a.total_work_seconds || 0;
                    bVal = b.total_work_seconds || 0;
                    break;
                case 'total_amount':
                    aVal = a.total_amount || 0;
                    bVal = b.total_amount || 0;
                    break;
                case 'description':
                    aVal = a.description || '';
                    bVal = b.description || '';
                    break;
                case 'is_active':
                    aVal = a.is_active ? 1 : 0;
                    bVal = b.is_active ? 1 : 0;
                    break;
                case 'payment_tracking_nr':
                    aVal = a.payment_tracking_nr || '';
                    bVal = b.payment_tracking_nr || '';
                    break;
                default:
                    return 0;
            }
            if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        setFilteredAssignments(filtered);
    }, [groupedAssignments, filters, dateRange, sortField, sortDirection]);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const loadSummary = useCallback(async () => {
        try {
            const res = await assignmentsService.getSummary({ period });
            setSummary(res.data);
        } catch (error) {
            console.error('Failed to load summary:', error);
        }
    }, [period]);

    useEffect(() => {
        loadData();
        loadSummary();
    }, [period, loadData, loadSummary]);

    // Subscribe to WebSocket events for assignment changes
    useEffect(() => {
        const unsubscribe = subscribe(['assignment_started', 'assignment_stopped', 'task_created', 'task_deleted'], () => {
            console.log('Assignment data changed, reloading...');
            loadData(true); // Silent refresh - no loading spinner
            loadSummary();
        });
        return unsubscribe;
    }, [subscribe, loadData, loadSummary]);

    // Smart sync: reload table when activeSession changes (started/stopped by any client)
    useEffect(() => {
        const currentSessionId = activeSession?.id ?? null;
        const prevSessionId = prevSessionIdRef.current;

        // If session ID changed (started, stopped, or switched), reload data
        if (currentSessionId !== prevSessionId) {
            const isInitialRender = prevSessionId === undefined;
            prevSessionIdRef.current = currentSessionId;

            // Reload data when session state changes (but not on initial render)
            if (!isInitialRender) {
                loadData(true); // Silent refresh - no loading spinner
                loadSummary();
            }
        }
    }, [activeSession?.id, loadData, loadSummary]);

    const handleStartClick = async () => {
        // Pre-select employment if user has only one
        if (employmentList.length === 1) {
            setSelectedEmployment(employmentList[0].id);
        }
        // Always show dialog for comment input
        setStartDialogOpen(true);
    };

    const handleStartSession = async () => {
        if (!selectedEmployment) return;

        const emp = employmentList.find(e => e.id === selectedEmployment);
        try {
            // If there's an active session, stop it first
            if (activeSession) {
                await assignmentsService.stop(activeSession.id);
            }

            await assignmentsService.start({
                worker_id: emp.employee_id,
                employer_id: emp.employer_id,
                description: startDescription || null,
                task_description: startTaskDescription || startDescription || null
            });
            setStartDialogOpen(false);
            setSelectedEmployment('');
            setStartDescription('');
            setStartTaskDescription('');
            loadData();
            fetchActiveSession(); // Refresh active session in context
        } catch (error) {
            console.error('Failed to start session:', error);
            showError(error.response?.data?.detail || 'Ошибка при запуске сессии');
        }
    };

    // Handle new task creation (switch to new task in current session)
    const handleNewTask = async () => {
        if (!activeSession) return;
        try {
            await assignmentsService.switchTask(activeSession.assignment_id, {
                description: newTaskDescription || null
            });
            setNewTaskOpen(false);
            setNewTaskDescription('');
            loadData();
            fetchActiveSession();
            notifySessionChange();
        } catch (error) {
            console.error('Failed to switch task:', error);
            showError(error.response?.data?.detail || 'Ошибка при создании задания');
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
                    Учёт заданий
                </Typography>
                <Box display="flex" gap={1}>
                    <Button
                        variant="contained"
                        color="success"
                        startIcon={<PlayArrow />}
                        onClick={handleStartClick}
                        disabled={!!activeSession}
                    >
                        Начать смену
                    </Button>
                    <Button
                        variant="contained"
                        color={activeSession?.session_type === 'pause' ? 'success' : 'warning'}
                        startIcon={activeSession?.session_type === 'pause' ? <PlayArrow /> : <Pause />}
                        onClick={() => activeSession && togglePause()}
                        disabled={!activeSession}
                    >
                        {activeSession?.session_type === 'pause' ? 'Продолжить' : 'Пауза'}
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        startIcon={<Stop />}
                        onClick={() => activeSession && stopSession()}
                        disabled={!activeSession}
                    >
                        Завершить
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<Add />}
                        onClick={() => setNewTaskOpen(true)}
                        disabled={!activeSession}
                    >
                        Новое задание
                    </Button>
                </Box>
            </Box>


            {/* Active session is now shown in FloatingTimer */}

            {/* Summary Cards - calculated from filtered data */}
            {(() => {
                // Calculate dynamic summary from filtered assignments
                const totalSessions = filteredAssignments.length;
                const totalTasks = filteredAssignments.reduce((sum, a) => sum + (a.segments?.filter(s => s.session_type === 'work').length || 0), 0);
                const totalHours = filteredAssignments.reduce((sum, a) => sum + (a.total_work_seconds || 0), 0) / 3600;
                const activeSessions = filteredAssignments.filter(a => a.is_active).length;
                const completedSessions = filteredAssignments.filter(a => !a.is_active).length;
                const paidSessions = filteredAssignments.filter(a => a.payment_status === 'paid').length;
                const unpaidSessions = filteredAssignments.filter(a => a.payment_tracking_nr && a.payment_status === 'unpaid').length;

                return (
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        {/* Смены / Задания */}
                        <Grid item xs={6} sm={4} md={2}>
                            <Card sx={{
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                color: 'white',
                                height: '100%'
                            }}>
                                <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                                    <Typography variant="caption">Смены / Задания</Typography>
                                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{totalSessions} / {totalTasks}</Typography>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Часы */}
                        <Grid item xs={6} sm={4} md={2}>
                            <Card sx={{
                                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                                color: 'white',
                                height: '100%'
                            }}>
                                <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                                    <Typography variant="caption">Часы</Typography>
                                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{totalHours.toFixed(1)}</Typography>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* В работе */}
                        <Grid item xs={6} sm={4} md={2}>
                            <Card sx={{
                                background: 'linear-gradient(135deg, #f5af19 0%, #f12711 100%)',
                                color: 'white',
                                height: '100%'
                            }}>
                                <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                                    <Typography variant="caption">В работе</Typography>
                                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{activeSessions}</Typography>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Готово */}
                        <Grid item xs={6} sm={4} md={2}>
                            <Card sx={{
                                background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                                color: 'white',
                                height: '100%'
                            }}>
                                <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                                    <Typography variant="caption">Готово</Typography>
                                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{completedSessions}</Typography>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Оплачено */}
                        <Grid item xs={6} sm={4} md={2}>
                            <Card sx={{
                                background: 'linear-gradient(135deg, #56ab2f 0%, #a8e063 100%)',
                                color: 'white',
                                height: '100%'
                            }}>
                                <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                                    <Typography variant="caption">Оплачено</Typography>
                                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{paidSessions}</Typography>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* К оплате */}
                        <Grid item xs={6} sm={4} md={2}>
                            <Card sx={{
                                background: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)',
                                color: 'white',
                                height: '100%'
                            }}>
                                <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                                    <Typography variant="caption">К оплате</Typography>
                                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{unpaidSessions}</Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>
                );
            })()}

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
                            label="Клиент"
                            size="small"
                            value={filters.worker}
                            onChange={(e) => setFilters({ ...filters, worker: e.target.value })}
                            sx={{ minWidth: 150 }}
                        >
                            <MenuItem value="">Все</MenuItem>
                            {employmentList.map(emp => (
                                <MenuItem key={emp.id} value={emp.employer_id}>{emp.employer_name}</MenuItem>
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
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<DateRange />}
                        onClick={(e) => setDateRangeAnchor(e.currentTarget)}
                        sx={{ minWidth: 200 }}
                    >
                        {dateRange[0].startDate && dateRange[0].endDate
                            ? `${formatDate(toLocalDateString(dateRange[0].startDate))} — ${formatDate(toLocalDateString(dateRange[0].endDate))}`
                            : 'Выберите период'}
                    </Button>
                    <Popover
                        open={Boolean(dateRangeAnchor)}
                        anchorEl={dateRangeAnchor}
                        onClose={() => setDateRangeAnchor(null)}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                    >
                        <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <DateRangePicker
                                onChange={(item) => setDateRange([item.selection])}
                                ranges={dateRange}
                                locale={ru}
                                months={1}
                                direction="horizontal"
                                rangeColors={['#1976d2']}
                                staticRanges={ruStaticRanges}
                                inputRanges={[]}
                            />
                            <Button
                                onClick={() => setDateRangeAnchor(null)}
                                sx={{ mr: 2, mb: 1 }}
                                variant="contained"
                                size="small"
                            >
                                ОК
                            </Button>
                        </Box>
                    </Popover>
                    <Button
                        variant="outlined"
                        onClick={() => {
                            setFilters({ search: '', worker: '', status: 'all' });
                            setDateRange([{ startDate: null, endDate: null, key: 'selection' }]);
                        }}
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
                                <TableCell>
                                    <TableSortLabel
                                        active={sortField === 'assignment_date'}
                                        direction={sortField === 'assignment_date' ? sortDirection : 'asc'}
                                        onClick={() => handleSort('assignment_date')}
                                    >
                                        <strong>Дата</strong>
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>
                                    <TableSortLabel
                                        active={sortField === 'worker_name'}
                                        direction={sortField === 'worker_name' ? sortDirection : 'asc'}
                                        onClick={() => handleSort('worker_name')}
                                    >
                                        <strong>Работник</strong>
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell align="center">
                                    <TableSortLabel
                                        active={sortField === 'total_work_seconds'}
                                        direction={sortField === 'total_work_seconds' ? sortDirection : 'asc'}
                                        onClick={() => handleSort('total_work_seconds')}
                                    >
                                        <strong>Время</strong>
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell align="right">
                                    <TableSortLabel
                                        active={sortField === 'total_amount'}
                                        direction={sortField === 'total_amount' ? sortDirection : 'asc'}
                                        onClick={() => handleSort('total_amount')}
                                    >
                                        <strong>Работа</strong>
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>
                                    <TableSortLabel
                                        active={sortField === 'description'}
                                        direction={sortField === 'description' ? sortDirection : 'asc'}
                                        onClick={() => handleSort('description')}
                                    >
                                        <strong>Описание</strong>
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell align="center">
                                    <TableSortLabel
                                        active={sortField === 'is_active'}
                                        direction={sortField === 'is_active' ? sortDirection : 'asc'}
                                        onClick={() => handleSort('is_active')}
                                    >
                                        <strong>Статус</strong>
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell align="center">
                                    <TableSortLabel
                                        active={sortField === 'payment_tracking_nr'}
                                        direction={sortField === 'payment_tracking_nr' ? sortDirection : 'asc'}
                                        onClick={() => handleSort('payment_tracking_nr')}
                                    >
                                        <strong>Платёж</strong>
                                    </TableSortLabel>
                                </TableCell>
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
                                        <TableCell>
                                            <strong>{formatDate(assignment.assignment_date)}</strong>
                                            <span style={{ fontSize: '0.75rem', color: '#666', marginLeft: '8px' }}>
                                                {assignment.tracking_nr || ''}
                                            </span>
                                        </TableCell>
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
                                        <Tooltip title={assignment.description || ''} arrow placement="top">
                                            <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {assignment.description || '—'}
                                            </TableCell>
                                        </Tooltip>
                                        <TableCell align="center">
                                            {assignment.is_active ? (
                                                <Chip label="В работе" color="warning" size="small" />
                                            ) : (
                                                <Chip label="Готово" color="success" size="small" />
                                            )}
                                        </TableCell>
                                        <TableCell align="center">
                                            {assignment.payment_tracking_nr ? (
                                                <Chip
                                                    label={assignment.payment_tracking_nr}
                                                    size="small"
                                                    color={assignment.payment_status === 'paid' ? "success" : "warning"}
                                                    clickable
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/payments?search=${assignment.payment_tracking_nr}`);
                                                    }}
                                                    sx={{ cursor: 'pointer' }}
                                                />
                                            ) : (
                                                <Typography variant="caption" color="text.secondary">—</Typography>
                                            )}
                                        </TableCell>
                                        <TableCell align="center">
                                            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                                                <IconButton
                                                    size="small"
                                                    onClick={(e) => handleEditAssignment(assignment, e)}
                                                    title="Редактировать"
                                                >
                                                    <Edit fontSize="small" />
                                                </IconButton>
                                                {!assignment.is_active && (
                                                    <IconButton
                                                        size="small"
                                                        onClick={(e) => handleDeleteAssignment(assignment, e)}
                                                        title="Удалить"
                                                    >
                                                        <Delete fontSize="small" />
                                                    </IconButton>
                                                )}
                                            </Box>
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
                                                                        <IconButton size="small" onClick={(e) => handleDeleteClick(seg.id, e)}>
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
                <DialogTitle>Начать смену</DialogTitle>
                <DialogContent sx={{ minWidth: 400 }}>
                    {employmentList.length === 0 ? (
                        <Alert severity="warning" sx={{ mt: 2 }}>
                            Нет активных трудовых отношений. Сначала создайте их в настройках.
                        </Alert>
                    ) : (
                        <>
                            {/* Warning if there's an active session */}
                            {activeSession && (
                                <Alert severity="warning" sx={{ mt: 2 }}>
                                    Текущая смена будет завершена и создастся новая.
                                </Alert>
                            )}
                            {/* Show employer selection only if admin or user has multiple employers */}
                            {(isAdmin || employmentList.length > 1) && (
                                <TextField
                                    select
                                    fullWidth
                                    label={isAdmin ? "Выберите работника" : "Выберите работодателя"}
                                    value={selectedEmployment}
                                    onChange={(e) => setSelectedEmployment(e.target.value)}
                                    sx={{ mt: 2 }}
                                >
                                    {isAdmin ? (
                                        // Admin view: group workers by employer if multiple employers
                                        (() => {
                                            const employers = [...new Set(employmentList.map(e => e.employer_name))];
                                            if (employers.length === 1) {
                                                // Single employer - just list workers
                                                return employmentList.map((emp) => (
                                                    <MenuItem key={emp.id} value={emp.id}>
                                                        {emp.employee_name}
                                                    </MenuItem>
                                                ));
                                            } else {
                                                // Multiple employers - group by employer
                                                return employers.flatMap(employer => [
                                                    <ListSubheader key={`header-${employer}`} sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                                                        {employer}
                                                    </ListSubheader>,
                                                    ...employmentList
                                                        .filter(e => e.employer_name === employer)
                                                        .map((emp) => (
                                                            <MenuItem key={emp.id} value={emp.id} sx={{ pl: 4 }}>
                                                                {emp.employee_name}
                                                            </MenuItem>
                                                        ))
                                                ]);
                                            }
                                        })()
                                    ) : (
                                        // Non-admin: simple employer list
                                        employmentList.map((emp) => (
                                            <MenuItem key={emp.id} value={emp.id}>
                                                {emp.employer_name}
                                            </MenuItem>
                                        ))
                                    )}
                                </TextField>
                            )}
                            <TextField
                                fullWidth
                                label="Комментарий смены"
                                value={startDescription}
                                onChange={(e) => setStartDescription(e.target.value)}
                                placeholder="Опишите смену..."
                                multiline
                                rows={2}
                                sx={{ mt: 2 }}
                            />
                            <TextField
                                fullWidth
                                label="Комментарий первого задания"
                                value={startTaskDescription}
                                onChange={(e) => setStartTaskDescription(e.target.value)}
                                placeholder="Если отличается от смены..."
                                multiline
                                rows={2}
                                sx={{ mt: 2 }}
                            />
                        </>
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

            {/* New Task Dialog (Switch Task) */}
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
                    ✏️ Редактировать смену {assignmentToEdit?.tracking_nr || ''}
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    {isAdmin && (
                        <Box display="flex" gap={2} sx={{ mt: 3, mb: 2 }}>
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
                    )}
                    <TextField
                        fullWidth
                        label="Комментарий"
                        multiline
                        rows={3}
                        value={assignmentForm.description}
                        onChange={(e) => setAssignmentForm({ ...assignmentForm, description: e.target.value })}
                        placeholder="Комментарий к смене..."
                        sx={{ mt: isAdmin ? 0 : 3 }}
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
