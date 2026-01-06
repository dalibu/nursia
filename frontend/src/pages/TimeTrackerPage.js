import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useWebSocket } from '../contexts/WebSocketContext';
import {
    Typography, Paper, Box, Button, Card, CardContent, Grid,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel,
    TextField, MenuItem, CircularProgress, Chip, Dialog, DialogTitle,
    DialogContent, DialogActions, Alert, IconButton, Collapse, Snackbar, ListSubheader,
    Popover, Tooltip, Menu
} from '@mui/material';
import { DateRangePicker } from 'react-date-range';
import { ru } from 'date-fns/locale';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, addDays, addMonths } from 'date-fns';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import {
    PlayArrow, Stop, AccessTime, Person, Work, Add,
    Refresh, Timer, Edit, Delete, Pause, Coffee,
    KeyboardArrowDown, KeyboardArrowUp, Search, DateRange,
    ArrowDropDown, NoteAdd, Replay, BeachAccess, Sick, EventBusy, MoneyOff
} from '@mui/icons-material';
import { assignments as assignmentsService, employment as employmentService, payments as paymentsService } from '../services/api';
import { useActiveSession } from '../context/ActiveSessionContext';
import ManualAssignmentDialog from '../components/ManualAssignmentDialog';
import TimeOffDialog from '../components/TimeOffDialog';

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

const currencySymbols = {
    'UAH': '₴',
    'EUR': '€',
    'USD': '$'
};

// Assignment type icon and color configuration (labels come from API)
const ASSIGNMENT_TYPE_ICONS = {
    work: { icon: Work, color: '#4caf50' },
    sick_leave: { icon: Sick, color: '#f44336' },
    vacation: { icon: BeachAccess, color: '#2196f3' },
    day_off: { icon: EventBusy, color: '#ff9800' },
    unpaid_leave: { icon: MoneyOff, color: '#9e9e9e' }
};

// LiveTimer component for displaying real-time elapsed time in table rows
const LiveTimer = ({ assignment, currentTime }) => {
    // For active sessions, calculate live elapsed time
    if (!assignment.is_active) {
        // Completed session - static display
        const totalMinutes = Math.floor(assignment.total_work_seconds / 60);
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        const hours = (assignment.total_work_seconds / 3600).toFixed(2).replace('.', ',');
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} (${hours} ч.)`;
    }

    // Find active segment
    const activeSegment = assignment.segments?.find(s => !s.end_time);
    const isPaused = activeSegment?.session_type === 'pause';

    // Calculate elapsed time since segment started
    const segmentStart = new Date(`${assignment.assignment_date}T${activeSegment?.start_time || assignment.start_time}`);
    const nowMs = currentTime?.getTime() || Date.now();
    const currentSegmentSeconds = Math.max(0, Math.floor((nowMs - segmentStart.getTime()) / 1000));

    // Add to existing totals
    let workSeconds = assignment.total_work_seconds || 0;
    let pauseSeconds = assignment.total_pause_seconds || 0;

    if (isPaused) {
        pauseSeconds += currentSegmentSeconds;
    } else {
        workSeconds += currentSegmentSeconds;
    }

    // Format work time
    const totalMinutes = Math.floor(workSeconds / 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    const sec = workSeconds % 60;
    const hours = (workSeconds / 3600).toFixed(2).replace('.', ',');

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{
                fontFamily: 'monospace',
                fontWeight: 700,
                color: isPaused ? 'warning.main' : 'success.main',
                '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.6 }
                },
                animation: isPaused ? 'none' : 'pulse 1s ease-in-out infinite'
            }}>
                {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(sec).padStart(2, '0')}
            </Box>
            <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                ({hours} ч.)
            </Box>
            {isPaused && (
                <Chip
                    icon={<Coffee sx={{ fontSize: '0.8rem !important' }} />}
                    label="пауза"
                    size="small"
                    color="warning"
                    sx={{ height: 20, fontSize: '0.65rem' }}
                />
            )}
        </Box>
    );
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
    const [assignmentTypes, setAssignmentTypes] = useState([]);
    const [summary, setSummary] = useState([]);
    const [period, setPeriod] = useState('all');  // Show all shifts by default
    const [isAdmin, setIsAdmin] = useState(false);

    // Initialize filters from URL params or localStorage
    const [filters, setFilters] = useState(() => {
        // First try URL params
        const urlSearch = searchParams.get('search');
        const urlWorker = searchParams.get('worker');
        const urlStatus = searchParams.get('status');
        const urlType = searchParams.get('type');

        if (urlSearch || urlWorker || urlStatus || urlType) {
            return {
                search: urlSearch || '',
                worker: urlWorker || '',
                status: urlStatus || 'all',
                type: urlType || 'all'
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
                    status: parsed.status || 'all',
                    type: parsed.type || 'all'
                };
            }
        } catch (e) { }

        return { search: '', worker: '', status: 'all', type: 'all' };
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
            startDate: null,
            endDate: null,
            key: 'selection'
        }];
    });
    const [dateRangeAnchor, setDateRangeAnchor] = useState(null);
    const [filteredAssignments, setFilteredAssignments] = useState([]);
    const [sortField, setSortField] = useState('assignment_date');
    const [sortDirection, setSortDirection] = useState('desc');

    // Infinite scroll pagination state
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const sentinelRef = useRef(null);
    const PAGE_SIZE = 50;

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

    // Dropdown menu for "Начать смену" button
    const [startMenuAnchor, setStartMenuAnchor] = useState(null);

    // Manual assignment dialog
    const [manualDialogOpen, setManualDialogOpen] = useState(false);
    const [cloneData, setCloneData] = useState(null); // Data for cloning assignment

    // Time-off dialog (vacation, sick leave, etc.)
    const [timeOffDialogOpen, setTimeOffDialogOpen] = useState(false);

    // New task dialog (for switching tasks)
    const [newTaskOpen, setNewTaskOpen] = useState(false);
    const [newTaskDescription, setNewTaskDescription] = useState('');
    const [newTaskAssignmentId, setNewTaskAssignmentId] = useState(null); // Which assignment to add task to

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
        if (filters.type && filters.type !== 'all') {
            params.set('type', filters.type);
            storageData.type = filters.type;
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
            // Reset pagination when loading fresh data
            setOffset(0);
            setHasMore(true);

            const [groupedRes, activeRes, empRes, userRes, typesRes] = await Promise.all([
                assignmentsService.getGrouped({ period, limit: PAGE_SIZE, offset: 0 }),
                assignmentsService.getActive(),
                employmentService.list({ is_active: true }),
                paymentsService.getUserInfo(),
                assignmentsService.getTypes()
            ]);
            setGroupedAssignments(groupedRes.data);
            setFilteredAssignments(groupedRes.data); // Initialize filtered list
            setActiveSessions(activeRes.data);
            setEmploymentList(empRes.data);
            setAssignmentTypes(typesRes.data || []);
            setIsAdmin(userRes.data.roles?.includes('admin') || userRes.data.role === 'admin');

            // Check if there might be more data
            setHasMore(groupedRes.data.length >= PAGE_SIZE);
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [period]);

    // Load more data for infinite scroll
    const loadMore = useCallback(async () => {
        if (loadingMore || !hasMore) return;

        setLoadingMore(true);
        try {
            const newOffset = offset + PAGE_SIZE;
            const groupedRes = await assignmentsService.getGrouped({
                period,
                limit: PAGE_SIZE,
                offset: newOffset
            });

            if (groupedRes.data.length > 0) {
                setGroupedAssignments(prev => [...prev, ...groupedRes.data]);
                setOffset(newOffset);
                setHasMore(groupedRes.data.length >= PAGE_SIZE);
            } else {
                setHasMore(false);
            }
        } catch (error) {
            console.error('Failed to load more data:', error);
        } finally {
            setLoadingMore(false);
        }
    }, [loadingMore, hasMore, offset, period]);

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

        // Assignment type filter
        if (filters.type && filters.type !== 'all') {
            filtered = filtered.filter(a => a.assignment_type === filters.type);
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

    // Subscribe to WebSocket events for assignment and payment changes (synchronize table)
    useEffect(() => {
        const events = [
            'assignment_started', 'assignment_stopped', 'assignment_updated', 'assignment_deleted',
            'task_created', 'task_updated', 'task_deleted',
            'payment_created', 'payment_updated', 'payment_deleted'
        ];
        const unsubscribe = subscribe(events, (event) => {
            loadData(true); // Silent refresh - no loading spinner
            loadSummary();
        });
        return unsubscribe;
    }, [subscribe, loadData, loadSummary]);

    // Infinite scroll - IntersectionObserver to load more when sentinel becomes visible
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
                    loadMore();
                }
            },
            { threshold: 0.1, rootMargin: '100px' }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMore, loadingMore, loading, loadMore]);

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
        const selectedWorkerId = emp.employee_id || emp.user_id;

        try {
            // If the SELECTED worker has an active session, stop it first
            const workerActiveSession = activeSessions.find(s => s.worker_id === selectedWorkerId);
            if (workerActiveSession) {
                await assignmentsService.stop(workerActiveSession.id);
            }

            await assignmentsService.start({
                worker_id: selectedWorkerId,
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

    // Handle dropdown menu
    const handleStartMenuOpen = (event) => {
        setStartMenuAnchor(event.currentTarget);
    };

    const handleStartMenuClose = () => {
        setStartMenuAnchor(null);
    };

    const handleStartTimerClick = () => {
        handleStartMenuClose();
        handleStartClick();
    };

    const handleManualAddClick = () => {
        handleStartMenuClose();
        setCloneData(null);  // Reset clone data for new assignment
        setManualDialogOpen(true);
    };

    // Handle cloning an assignment
    const handleCloneAssignment = (assignment, e) => {
        e?.stopPropagation();

        // Find the employment by matching employee_id with worker_id from assignment
        // In EmploymentResponse: employee_id = user_id (worker)
        const employment = employmentList.find(emp => emp.employee_id === assignment.worker_id);

        // Prepare clone data from the assignment
        const cloneInfo = {
            employment_id: employment?.id || '',
            assignment_date: assignment.assignment_date,  // Copy shift date
            hourly_rate: assignment.hourly_rate,
            currency: assignment.currency,
            description: assignment.description || '',
            tasks: assignment.segments?.map(seg => ({
                start_time: seg.start_time?.slice(0, 5) || '09:00',
                end_time: seg.end_time?.slice(0, 5) || '18:00',
                task_type: seg.session_type || 'work',
                description: seg.description || ''
            })) || []
        };
        setCloneData(cloneInfo);
        setManualDialogOpen(true);
    };

    // Handle saving manual assignment
    // keepOpen = true when user clicks "Save and Create Another"
    // newCloneData contains updated form data for next iteration
    const handleSaveManualAssignment = async (payload, keepOpen = false, newCloneData = null) => {
        const result = await assignmentsService.createManual(payload);
        loadData();
        loadSummary();
        if (keepOpen && newCloneData) {
            // Update cloneData with new values for the next assignment
            setCloneData(newCloneData);
        } else if (!keepOpen) {
            setCloneData(null);  // Clear clone data after save (only if closing dialog)
        }
        showSuccess(`Смена ${result.data.tracking_nr} создана!`);
        return result.data;
    };

    // Handle payment edit after manual assignment creation
    const handlePaymentEditFromManual = (paymentId, assignmentResult) => {
        // Navigate to payments page with the new payment
        navigate(`/payments?search=${assignmentResult.payment_tracking_nr}`);
        showSuccess(`Смена ${assignmentResult.tracking_nr} создана! Перейдите к платежу для редактирования.`);
    };

    // Handle new task creation (switch to new task in current or specified session)
    const handleNewTask = async () => {
        // Use newTaskAssignmentId if set, otherwise fall back to active session
        const assignmentId = newTaskAssignmentId || activeSession?.assignment_id;
        if (!assignmentId) return;
        try {
            await assignmentsService.switchTask(assignmentId, {
                description: newTaskDescription || null
            });
            setNewTaskOpen(false);
            setNewTaskDescription('');
            setNewTaskAssignmentId(null);
            loadData();
            fetchActiveSession();
            notifySessionChange();
        } catch (error) {
            console.error('Failed to switch task:', error);
            showError(error.response?.data?.detail || 'Ошибка при создании задания');
        }
    };

    // Open new task dialog for a specific assignment (admin feature)
    const handleNewTaskForAssignment = (assignment, e) => {
        if (e) e.stopPropagation();
        setNewTaskAssignmentId(assignment.assignment_id);
        setNewTaskDescription('');
        setNewTaskOpen(true);
    };

    // Pause/resume for a specific assignment (by assignment object)
    const handlePauseResumeAssignment = async (assignment, e) => {
        if (e) e.stopPropagation();
        try {
            // Find the active segment (task without end_time) - its ID is needed for API
            const activeSegment = assignment.segments?.find(s => !s.end_time);
            if (!activeSegment) {
                showError('Не найден активный сегмент');
                return;
            }
            const isPaused = activeSegment.session_type === 'pause';
            const endpoint = isPaused ? 'resume' : 'pause';
            await assignmentsService[endpoint](activeSegment.id);  // Use Task ID
            loadData();
            fetchActiveSession();
            notifySessionChange();
        } catch (error) {
            console.error('Failed to toggle pause:', error);
            showError(error.response?.data?.detail || 'Ошибка при переключении паузы');
        }
    };

    // Stop a specific assignment session
    const handleStopAssignment = async (assignment, e) => {
        if (e) e.stopPropagation();
        try {
            // Find the active segment (task without end_time) - its ID is needed for API
            const activeSegment = assignment.segments?.find(s => !s.end_time);
            if (!activeSegment) {
                showError('Не найден активный сегмент');
                return;
            }
            await assignmentsService.stop(activeSegment.id);  // Use Task ID
            loadData();
            loadSummary();
            fetchActiveSession();
            notifySessionChange();
        } catch (error) {
            console.error('Failed to stop session:', error);
            showError(error.response?.data?.detail || 'Ошибка при остановке сессии');
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
                    description: assignmentForm.description  // Allow empty string to clear description
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
                    Учёт времени
                </Typography>
                <Box display="flex" gap={1}>
                    {/* Dropdown menu for "Начать смену" */}
                    <Button
                        variant="contained"
                        color="success"
                        endIcon={<ArrowDropDown />}
                        onClick={handleStartMenuOpen}
                        sx={{
                            '& .MuiButton-endIcon': { ml: 0.5 }
                        }}
                    >
                        Начать смену
                    </Button>
                    <Menu
                        anchorEl={startMenuAnchor}
                        open={Boolean(startMenuAnchor)}
                        onClose={handleStartMenuClose}
                        anchorOrigin={{
                            vertical: 'bottom',
                            horizontal: 'left',
                        }}
                        transformOrigin={{
                            vertical: 'top',
                            horizontal: 'left',
                        }}
                    >
                        <MenuItem
                            onClick={handleStartTimerClick}
                            disabled={!isAdmin && !!activeSession}
                        >
                            <PlayArrow sx={{ mr: 1, color: 'success.main' }} />
                            Запустить таймер
                        </MenuItem>
                        <MenuItem onClick={handleManualAddClick}>
                            <NoteAdd sx={{ mr: 1, color: 'primary.main' }} />
                            Добавить вручную
                        </MenuItem>
                        <MenuItem onClick={() => { setStartMenuAnchor(null); setTimeOffDialogOpen(true); }}>
                            <BeachAccess sx={{ mr: 1, color: 'warning.main' }} />
                            Отпуск/Больничный
                        </MenuItem>
                    </Menu>
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
                        <Grid item xs={6} sm={3} md={3}>
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
                        <Grid item xs={6} sm={3} md={3}>
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
                        <Grid item xs={6} sm={3} md={3}>
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
                        <Grid item xs={6} sm={3} md={3}>
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
                            label="Исполнитель"
                            size="small"
                            value={filters.worker}
                            onChange={(e) => setFilters({ ...filters, worker: e.target.value })}
                            sx={{ minWidth: 150 }}
                        >
                            <MenuItem value="">Все</MenuItem>
                            {employmentList.map(emp => (
                                <MenuItem key={emp.id} value={emp.employee_id}>{emp.employee_name}</MenuItem>
                            ))}
                        </TextField>
                    )}
                    <TextField
                        select
                        label="Тип"
                        size="small"
                        value={filters.type}
                        onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                        sx={{ minWidth: 120 }}
                    >
                        <MenuItem value="all">Все</MenuItem>
                        {assignmentTypes.map(t => (
                            <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                        ))}
                    </TextField>
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
                            setFilters({ search: '', worker: '', status: 'all', type: 'all' });
                            setDateRange([{ startDate: null, endDate: null, key: 'selection' }]);
                        }}
                    >
                        Очистить
                    </Button>
                </Box>
            </Paper>

            <Paper sx={{ py: 3, px: 0 }}>

                <TableContainer>
                    <Table size="small" sx={{ tableLayout: 'fixed' }}>
                        <TableHead>
                            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>

                                <TableCell width={160} padding="none" sx={{ pl: 5 }}>
                                    <TableSortLabel
                                        active={sortField === 'assignment_date'}
                                        direction={sortField === 'assignment_date' ? sortDirection : 'asc'}
                                        onClick={() => handleSort('assignment_date')}
                                    >
                                        <strong>Дата</strong>
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell width={150}>
                                    <TableSortLabel
                                        active={sortField === 'worker_name'}
                                        direction={sortField === 'worker_name' ? sortDirection : 'asc'}
                                        onClick={() => handleSort('worker_name')}
                                    >
                                        <strong>Исполнитель</strong>
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell width={110}>
                                    <TableSortLabel
                                        active={sortField === 'assignment_type'}
                                        direction={sortField === 'assignment_type' ? sortDirection : 'asc'}
                                        onClick={() => handleSort('assignment_type')}
                                    >
                                        <strong>Тип</strong>
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell width={130} align="center">
                                    <TableSortLabel
                                        active={sortField === 'total_work_seconds'}
                                        direction={sortField === 'total_work_seconds' ? sortDirection : 'asc'}
                                        onClick={() => handleSort('total_work_seconds')}
                                    >
                                        <strong>Время</strong>
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell width={100} align="right">
                                    <TableSortLabel
                                        active={sortField === 'total_amount'}
                                        direction={sortField === 'total_amount' ? sortDirection : 'asc'}
                                        onClick={() => handleSort('total_amount')}
                                    >
                                        <strong>Продолж.</strong>
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
                                <TableCell width={100} align="center">
                                    <TableSortLabel
                                        active={sortField === 'is_active'}
                                        direction={sortField === 'is_active' ? sortDirection : 'asc'}
                                        onClick={() => handleSort('is_active')}
                                    >
                                        <strong>Статус</strong>
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell width={120} align="center">
                                    <TableSortLabel
                                        active={sortField === 'payment_tracking_nr'}
                                        direction={sortField === 'payment_tracking_nr' ? sortDirection : 'asc'}
                                        onClick={() => handleSort('payment_tracking_nr')}
                                    >
                                        <strong>Платёж</strong>
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell width={140} align="right" sx={{ pr: 4 }}>
                                    <strong>Действия</strong>
                                </TableCell>
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
                                        onClick={() => {
                                            if (assignment.segments && assignment.segments.length > 0) {
                                                setExpandedRows(prev => ({
                                                    ...prev,
                                                    [assignment.assignment_id]: !prev[assignment.assignment_id]
                                                }));
                                            }
                                        }}
                                    >

                                        <TableCell padding="none" sx={{ pl: 1, whiteSpace: 'nowrap' }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                <Box sx={{ width: 24, minWidth: 24, flexShrink: 0, mr: 1, display: 'flex', justifyContent: 'center' }}>
                                                    {(assignment.segments && assignment.segments.length > 0) && (
                                                        <IconButton size="small" onClick={(e) => {
                                                            e.stopPropagation();
                                                            setExpandedRows(prev => ({
                                                                ...prev,
                                                                [assignment.assignment_id]: !prev[assignment.assignment_id]
                                                            }));
                                                        }}>
                                                            {expandedRows[assignment.assignment_id] ? <KeyboardArrowUp fontSize="small" /> : <KeyboardArrowDown fontSize="small" />}
                                                        </IconButton>
                                                    )}
                                                </Box>
                                                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                                                    <span>{formatDate(assignment.assignment_date)}</span>
                                                    <span style={{ fontSize: '0.75rem', color: '#666' }}>
                                                        {assignment.tracking_nr || ''}
                                                    </span>
                                                </Box>
                                            </Box>
                                        </TableCell>
                                        <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={assignment.worker_name}>
                                            {assignment.worker_name}
                                        </TableCell>
                                        <TableCell>
                                            {(() => {
                                                const iconConfig = ASSIGNMENT_TYPE_ICONS[assignment.assignment_type || 'work'];
                                                const typeData = assignmentTypes.find(t => t.value === assignment.assignment_type) || { label: 'Смена' };
                                                const Icon = iconConfig?.icon || Work;
                                                return (
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                        <Icon sx={{ fontSize: 16, color: iconConfig?.color || '#666' }} />
                                                        <span style={{ color: iconConfig?.color || '#666' }}>
                                                            {typeData.label}
                                                        </span>
                                                    </Box>
                                                );
                                            })()}
                                        </TableCell>
                                        <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                                            {assignment.assignment_type && assignment.assignment_type !== 'work'
                                                ? '—'
                                                : `${formatTime(assignment.start_time)} — ${assignment.end_time ? formatTime(assignment.end_time) : '...'}`
                                            }
                                        </TableCell>
                                        <TableCell align="right">
                                            {assignment.assignment_type === 'work' || !assignment.assignment_type ? (
                                                <LiveTimer assignment={assignment} currentTime={currentTime} />
                                            ) : (
                                                <span style={{ color: '#666' }}>—</span>
                                            )}
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
                                        <TableCell align="right" sx={{ pr: 1 }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                                                {/* Session control buttons for active sessions */}
                                                {assignment.is_active && (
                                                    <>
                                                        <Tooltip title={(() => {
                                                            const activeSegment = assignment.segments?.find(s => !s.end_time);
                                                            return activeSegment?.session_type === 'pause' ? 'Продолжить' : 'Пауза';
                                                        })()}>
                                                            <IconButton
                                                                size="small"
                                                                onClick={(e) => handlePauseResumeAssignment(assignment, e)}
                                                                sx={{
                                                                    color: (() => {
                                                                        const activeSegment = assignment.segments?.find(s => !s.end_time);
                                                                        return activeSegment?.session_type === 'pause' ? 'success.main' : 'warning.main';
                                                                    })()
                                                                }}
                                                            >
                                                                {(() => {
                                                                    const activeSegment = assignment.segments?.find(s => !s.end_time);
                                                                    return activeSegment?.session_type === 'pause' ? <PlayArrow fontSize="small" /> : <Pause fontSize="small" />;
                                                                })()}
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title="Завершить">
                                                            <IconButton
                                                                size="small"
                                                                onClick={(e) => handleStopAssignment(assignment, e)}
                                                                sx={{ color: 'error.main' }}
                                                            >
                                                                <Stop fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title="Новое задание">
                                                            <IconButton
                                                                size="small"
                                                                onClick={(e) => handleNewTaskForAssignment(assignment, e)}
                                                                sx={{ color: 'primary.main' }}
                                                            >
                                                                <Add fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </>
                                                )}
                                                <Tooltip title="Клонировать">
                                                    <IconButton
                                                        size="small"
                                                        onClick={(e) => handleCloneAssignment(assignment, e)}
                                                    >
                                                        <Replay fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Редактировать">
                                                    <IconButton
                                                        size="small"
                                                        onClick={(e) => handleEditAssignment(assignment, e)}
                                                    >
                                                        <Edit fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                {!assignment.is_active && (
                                                    <Tooltip title="Удалить">
                                                        <IconButton
                                                            size="small"
                                                            onClick={(e) => handleDeleteAssignment(assignment, e)}
                                                        >
                                                            <Delete fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                            </Box>
                                        </TableCell>
                                    </TableRow>

                                    {/* Expandable segments */}
                                    <TableRow>
                                        <TableCell colSpan={9} sx={{ p: 0, border: 0 }}>
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
                                                                        <Tooltip title="Редактировать">
                                                                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleEditClick(seg); }}>
                                                                                <Edit fontSize="small" />
                                                                            </IconButton>
                                                                        </Tooltip>
                                                                        <Tooltip title="Удалить">
                                                                            <IconButton size="small" onClick={(e) => handleDeleteClick(seg.id, e)}>
                                                                                <Delete fontSize="small" />
                                                                            </IconButton>
                                                                        </Tooltip>
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

                {/* Infinite scroll sentinel and loading indicator */}
                <Box
                    ref={sentinelRef}
                    sx={{
                        height: 1,
                        visibility: 'hidden'
                    }}
                />
                {loadingMore && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                        <CircularProgress size={24} />
                        <Typography variant="body2" sx={{ ml: 1, color: 'text.secondary' }}>
                            Загрузка...
                        </Typography>
                    </Box>
                )}
                {!hasMore && filteredAssignments.length > 0 && (
                    <Box sx={{ textAlign: 'center', py: 2, color: 'text.secondary' }}>
                        <Typography variant="body2">
                            Все записи загружены ({filteredAssignments.length})
                        </Typography>
                    </Box>
                )}
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
                            {/* Warning if selected worker already has an active session */}
                            {(() => {
                                const selectedEmp = employmentList.find(e => e.id === selectedEmployment);
                                const selectedWorkerId = selectedEmp?.user_id || selectedEmp?.employee_id;
                                const hasActiveSession = selectedWorkerId && activeSessions.some(s => s.worker_id === selectedWorkerId);
                                return hasActiveSession ? (
                                    <Alert severity="warning" sx={{ mt: 2 }}>
                                        У этого работника есть активная смена. Она будет завершена и создастся новая.
                                    </Alert>
                                ) : null;
                            })()}
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

            {/* Manual Assignment Dialog */}
            <ManualAssignmentDialog
                open={manualDialogOpen}
                onClose={() => { setManualDialogOpen(false); setCloneData(null); }}
                onSave={handleSaveManualAssignment}
                employmentList={employmentList}
                isAdmin={isAdmin}
                onPaymentEdit={handlePaymentEditFromManual}
                initialData={cloneData}
            />

            {/* Time Off Dialog (Vacation, Sick Leave, etc.) */}
            <TimeOffDialog
                open={timeOffDialogOpen}
                onClose={() => setTimeOffDialogOpen(false)}
                onSave={() => { setTimeOffDialogOpen(false); loadData(true); }}
                employmentList={employmentList}
                isAdmin={isAdmin}
            />

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
