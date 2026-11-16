import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Box,
    Typography,
    IconButton,
    MenuItem,
    Alert,
    Chip,
    Divider,
    Paper,
    Tooltip,
    FormControlLabel,
    Switch
} from '@mui/material';
import {
    Add as AddIcon,
    Delete as DeleteIcon,
    Work as WorkIcon,
    Coffee as CoffeeIcon,
    AccessTime as TimeIcon,
    Sick as SickIcon,
    BeachAccess as VacationIcon,
    EventBusy as DayOffIcon,
    MoneyOff as UnpaidIcon
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { uk, ru, de, enUS } from 'date-fns/locale';
import api from '../services/api';
import { toLocalDateString } from '../utils/dateFormat';
import { alpha } from '@mui/material/styles';

const DEFAULT_START_TIME = '08:00';
const DEFAULT_END_TIME = '17:00';

const dateFnsLocales = { uk, ru, de, en: enUS };

// Assignment types configuration
const ASSIGNMENT_TYPES = [
    { value: 'work', labelKey: 'timetracker.typeWorkShift', icon: WorkIcon, color: '#4caf50', category: 'work' },
    { value: 'sick_leave', labelKey: 'timetracker.typeSickLeave', icon: SickIcon, color: '#f44336', category: 'time_off' },
    { value: 'vacation', labelKey: 'timetracker.typeVacation', icon: VacationIcon, color: '#2196f3', category: 'time_off' },
    { value: 'day_off', labelKey: 'timetracker.typeDayOff', icon: DayOffIcon, color: '#ff9800', category: 'time_off' },
    { value: 'unpaid_leave', labelKey: 'timetracker.typeUnpaidLeave', icon: UnpaidIcon, color: '#9e9e9e', category: 'time_off' }
];

// Helper to format time input for display
const formatTimeDisplay = (timeStr) => {
    if (!timeStr) return '';
    return timeStr.substring(0, 5);
};

// Convert HH:MM to minutes for calculations
const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
};

// Format minutes to HH:MM display
const minutesToDisplay = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

function CreateAssignmentDialog({
    open,
    onClose,
    onSave,
    onRefresh,  // Callback to refresh data (used for time-off)
    onAssignmentCreated,  // Callback with assignment_id to expand it in table
    employmentList,
    isAdmin,
    initialData = null  // Optional data for cloning
}) {
    const { t, i18n } = useTranslation();
    // Form state
    const [selectedEmployment, setSelectedEmployment] = useState('');
    const [assignmentType, setAssignmentType] = useState('work');
    const [assignmentDate, setAssignmentDate] = useState(new Date());
    const [endDate, setEndDate] = useState(new Date()); // For time-off range
    const [hoursPerDay, setHoursPerDay] = useState('8');
    const [isPaid, setIsPaid] = useState(true);
    const [description, setDescription] = useState('');
    const [tasks, setTasks] = useState([
        { start_time: '09:00', end_time: '18:00', task_type: 'work', description: '' }
    ]);

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    // Track previous open state to only reset form when dialog opens
    const prevOpenRef = useRef(false);

    // Determine if current type is work or time-off
    const currentTypeInfo = ASSIGNMENT_TYPES.find(t => t.value === assignmentType);
    const isWorkType = currentTypeInfo?.category === 'work';
    const isTimeOffType = currentTypeInfo?.category === 'time_off';

    // Reset form only when dialog opens (transitions from closed to open)
    useEffect(() => {
        const justOpened = open && !prevOpenRef.current;
        prevOpenRef.current = open;

        if (!justOpened) return;

        setError('');
        setLoading(false);
        setResult(null);

        if (initialData) {
            // Clone mode: pre-fill with initial data
            setSelectedEmployment(initialData.employment_id || '');
            setAssignmentType(initialData.assignment_type || 'work');
            setAssignmentDate(initialData.assignment_date ? new Date(initialData.assignment_date) : new Date());
            setEndDate(initialData.end_date ? new Date(initialData.end_date) : new Date());
            setHoursPerDay(initialData.hours_per_day || '8');
            setIsPaid(initialData.is_paid !== false);
            setDescription(initialData.description || '');

            // Clone tasks if available (for work type)
            if (initialData.tasks && initialData.tasks.length > 0) {
                setTasks(initialData.tasks.map(t => {
                    // Extract local HH:MM from ISO string if needed
                    let start = t.start_time || DEFAULT_START_TIME;
                    let end = t.end_time || DEFAULT_END_TIME;

                    if (start.includes('T') || start.includes('-')) {
                        const d = new Date(start);
                        if (!isNaN(d.getTime())) {
                            start = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                        }
                    }
                    if (end.includes('T') || end.includes('-')) {
                        const d = new Date(end);
                        if (!isNaN(d.getTime())) {
                            end = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                        }
                    }

                    // Enforce valid task types
                    const validType = ['work', 'pause'].includes(t.task_type) ? t.task_type : 'work';

                    return {
                        start_time: start,
                        end_time: end,
                        task_type: validType,
                        description: t.description || ''
                    };
                }));
            } else {
                setTasks([
                    { start_time: DEFAULT_START_TIME, end_time: DEFAULT_END_TIME, task_type: 'work', description: initialData.description || '' }
                ]);
            }
        } else {
            // Normal mode: reset to defaults
            setAssignmentType('work');
            setAssignmentDate(new Date());
            setEndDate(new Date());
            setHoursPerDay('8');
            setIsPaid(true);
            setDescription('');
            setTasks([
                { start_time: DEFAULT_START_TIME, end_time: DEFAULT_END_TIME, task_type: 'work', description: '' }
            ]);

            // Auto-select employment if only one exists
            if (employmentList.length === 1) {
                setSelectedEmployment(employmentList[0].id);
            } else {
                setSelectedEmployment('');
            }
        }
    }, [open, employmentList, initialData]);

    // Auto-set isPaid based on type
    useEffect(() => {
        if (assignmentType === 'unpaid_leave') {
            setIsPaid(false);
        }
    }, [assignmentType]);

    // Calculate totals for work type
    const totals = useMemo(() => {
        if (!isWorkType) return null;

        let workMinutes = 0;
        let pauseMinutes = 0;

        tasks.forEach(task => {
            const start = timeToMinutes(task.start_time);
            const end = timeToMinutes(task.end_time);
            const duration = end > start ? end - start : 0;

            if (task.task_type === 'work') {
                workMinutes += duration;
            } else {
                pauseMinutes += duration;
            }
        });

        const workHours = workMinutes / 60;

        return {
            workTime: minutesToDisplay(workMinutes),
            pauseTime: minutesToDisplay(pauseMinutes),
            workHours: workHours.toFixed(2)
        };
    }, [tasks, isWorkType]);

    // Calculate days count for time-off
    const daysCount = useMemo(() => {
        if (!isTimeOffType) return 0;
        return Math.max(1, Math.ceil((endDate - assignmentDate) / (1000 * 60 * 60 * 24)) + 1);
    }, [assignmentDate, endDate, isTimeOffType]);

    // Validate tasks for overlaps (work type only)
    const validateTasks = () => {
        // Check each task has valid times
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            if (!task.start_time || !task.end_time) {
                return t('timetracker.taskTimeRequired', { number: i + 1 });
            }
            const start = timeToMinutes(task.start_time);
            const end = timeToMinutes(task.end_time);
            if (end <= start) {
                return t('timetracker.taskEndTimeBeforeStart', { number: i + 1 });
            }
        }

        // Check for overlaps between tasks
        for (let i = 0; i < tasks.length; i++) {
            for (let j = i + 1; j < tasks.length; j++) {
                const t1Start = timeToMinutes(tasks[i].start_time);
                const t1End = timeToMinutes(tasks[i].end_time);
                const t2Start = timeToMinutes(tasks[j].start_time);
                const t2End = timeToMinutes(tasks[j].end_time);

                if (t1Start < t2End && t1End > t2Start) {
                    return t('timetracker.tasksOverlap', { first: i + 1, second: j + 1 });
                }
            }
        }

        return null;
    };

    const handleAddTask = () => {
        // Find last task's end time to use as start for new task
        let lastEndTime = '18:00';
        if (tasks.length > 0) {
            const sortedTasks = [...tasks].sort((a, b) =>
                timeToMinutes(b.end_time) - timeToMinutes(a.end_time)
            );
            lastEndTime = sortedTasks[0].end_time;
        }

        // New task starts where previous ended, lasts 1 hour
        const startMinutes = timeToMinutes(lastEndTime);
        const endMinutes = Math.min(startMinutes + 60, 23 * 60 + 59);

        setTasks([...tasks, {
            start_time: minutesToDisplay(startMinutes),
            end_time: minutesToDisplay(endMinutes),
            task_type: 'work',
            description: ''
        }]);
    };

    const handleRemoveTask = (index) => {
        if (tasks.length === 1) return; // Keep at least one task
        setTasks(tasks.filter((_, i) => i !== index));
    };

    const handleTaskChange = (index, field, value) => {
        const newTasks = [...tasks];
        newTasks[index] = { ...newTasks[index], [field]: value };
        setTasks(newTasks);
    };

    const handleSave = async (keepOpen = false) => {
        setError('');

        // Validate
        if (!selectedEmployment) {
            setError(t('timetracker.selectWorker'));
            return;
        }
        if (!assignmentDate) {
            setError(t('timetracker.selectDate'));
            return;
        }

        const emp = employmentList.find(e => e.id === selectedEmployment);
        const workerId = emp?.employee_id || emp?.user_id;

        if (isWorkType) {
            // Work type validation and submission
            if (tasks.length === 0) {
                setError(t('timetracker.addAtLeastOneTask'));
                return;
            }

            const validationError = validateTasks();
            if (validationError) {
                setError(validationError);
                return;
            }

            const dateStr = toLocalDateString(assignmentDate);

            const payload = {
                worker_id: workerId,
                assignment_type: 'work',
                description: description || null,
                tasks: tasks.map(t => ({
                    start_time: `${dateStr}T${t.start_time}:00`,
                    end_time: `${dateStr}T${t.end_time}:00`,
                    task_type: t.task_type,
                    description: t.description || null
                }))
            };

            setLoading(true);
            try {
                if (keepOpen) {
                    // Prepare new clone data for next iteration
                    const newCloneData = {
                        employment_id: selectedEmployment,
                        assignment_type: assignmentType,
                        assignment_date: toLocalDateString(assignmentDate),
                        description: description || '',
                        tasks: tasks.map(t => ({
                            start_time: t.start_time,
                            end_time: t.end_time,
                            task_type: t.task_type,
                            description: t.description || ''
                        }))
                    };
                    // Call save callback once with keepOpen=true
                    await onSave(payload, true, newCloneData);
                } else {
                    // Call save callback once with keepOpen=false
                    const result = await onSave(payload);

                    // Close dialog and notify about created assignment
                    onClose();
                    if (result?.assignment_id && onAssignmentCreated) {
                        onAssignmentCreated(result.assignment_id);
                    }
                }
            } catch (err) {
                console.error('Failed to create assignment:', err);
                console.error('Server error details:', err.response?.data);

                const detail = err.response?.data?.detail;
                const errorMsg = typeof detail === 'object' ? JSON.stringify(detail) : (detail || t('timetracker.shiftCreateError'));
                setError(errorMsg);
            } finally {
                setLoading(false);
            }
        } else {
            // Time-off type validation and submission
            if (endDate < assignmentDate) {
                setError(t('timetracker.endDateBeforeStart'));
                return;
            }

            if (daysCount > 365) {
                setError(t('timetracker.maxPeriodDays'));
                return;
            }

            setLoading(true);
            try {
                // Use noon to avoid timezone date shifts when backend extracts date
                const startDateTime = new Date(assignmentDate);
                startDateTime.setHours(12, 0, 0, 0);

                const endDateTime = new Date(endDate);
                endDateTime.setHours(12, 0, 0, 0);

                const payload = {
                    worker_id: workerId,
                    assignment_type: assignmentType,
                    start_time: startDateTime.toISOString(),
                    end_time: endDateTime.toISOString(),
                    description: description || null,
                    is_paid: isPaid,
                    hours_per_day: parseFloat(hoursPerDay) || 8.0
                };

                const response = await api.post('/assignments/time-off', payload);

                // Auto-close and refresh data after successful creation
                if (onRefresh) {
                    onRefresh();
                }
                onClose();
            } catch (err) {
                const detail = err.response?.data?.detail;
                if (typeof detail === 'string') {
                    setError(detail);
                } else if (Array.isArray(detail)) {
                    setError(detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', '));
                } else {
                    setError(t('timetracker.recordsCreateError'));
                }
            } finally {
                setLoading(false);
            }
        }
    };

    const handleClose = () => {
        // If we had a successful result (time-off), refresh data
        if (result && onRefresh) {
            onRefresh();
        }
        setError('');
        setResult(null);
        onClose();
    };

    const TypeIcon = currentTypeInfo?.icon;

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: { borderRadius: 3 }
            }}
        >
            <DialogTitle sx={{
                background: `linear-gradient(135deg, ${currentTypeInfo?.color || '#667eea'} 0%, ${currentTypeInfo?.color || '#764ba2'}99 100%)`,
                color: 'white',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: 1
            }}>
                {TypeIcon && <TypeIcon />}
                {t('timetracker.createRecord')}
            </DialogTitle>

            <DialogContent sx={{ pt: 4 }}>
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                {result && (
                    <Alert severity="success" sx={{ mb: 2 }}>
                        {t('timetracker.recordsCreated', { count: result.created_count })}
                        {result.skipped_dates?.length > 0 && (
                            <Typography variant="caption" display="block">
                                {t('timetracker.skippedDates', { dates: result.skipped_dates.join(', ') })}
                            </Typography>
                        )}
                    </Alert>
                )}

                {/* Basic info section */}
                <Box display="flex" gap={2} flexWrap="wrap" mb={3} mt={2}>
                    {/* Employment selector */}
                    <TextField
                        select
                        label={isAdmin ? t('timetracker.worker') : t('timetracker.employmentRelations')}
                        value={selectedEmployment}
                        onChange={(e) => setSelectedEmployment(e.target.value)}
                        sx={{ minWidth: 200, flex: 1 }}
                        required
                    >
                        {employmentList.map((emp) => (
                            <MenuItem key={emp.id} value={emp.id}>
                                {isAdmin ? (emp.employee_name || emp.worker_name) : emp.employer_name}
                            </MenuItem>
                        ))}
                    </TextField>

                    {/* Assignment type selector */}
                    <TextField
                        select
                        label={t('timetracker.recordType')}
                        value={assignmentType}
                        onChange={(e) => setAssignmentType(e.target.value)}
                        sx={{ minWidth: 200 }}
                        required
                    >
                        {ASSIGNMENT_TYPES.map((type) => {
                            const Icon = type.icon;
                            return (
                                <MenuItem key={type.value} value={type.value}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Icon sx={{ color: type.color, fontSize: 20 }} />
                                        {t(type.labelKey)}
                                    </Box>
                                </MenuItem>
                            );
                        })}
                    </TextField>
                </Box>

                {/* Date picker(s) */}
                <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={dateFnsLocales[i18n.language] || uk}>
                    <Box display="flex" gap={2} mb={3}>
                        <DatePicker
                            label={isTimeOffType ? t('timetracker.fromDate') : t('timetracker.shiftDate')}
                            value={assignmentDate}
                            onChange={(date) => {
                                setAssignmentDate(date);
                                if (isTimeOffType && date > endDate) {
                                    setEndDate(date);
                                }
                            }}
                            format="dd.MM.yyyy"
                            slotProps={{
                                textField: {
                                    sx: { minWidth: 150 },
                                    required: true
                                }
                            }}
                        />
                        {isTimeOffType && (
                            <DatePicker
                                label={t('timetracker.toDate')}
                                value={endDate}
                                onChange={(date) => setEndDate(date)}
                                minDate={assignmentDate}
                                format="dd.MM.yyyy"
                                slotProps={{
                                    textField: { sx: { minWidth: 150 } }
                                }}
                            />
                        )}
                    </Box>
                </LocalizationProvider>

                {/* Time-off specific options */}
                {isTimeOffType && (
                    <Box mb={3}>
                        <Box display="flex" gap={2} alignItems="center" mb={2}>
                            <Typography variant="body2" color="text.secondary">
                                {t('timetracker.daysCountLabel')} <strong>{daysCount}</strong>
                            </Typography>
                            <TextField
                                label={t('timetracker.hoursPerDay')}
                                type="number"
                                value={hoursPerDay}
                                onChange={(e) => setHoursPerDay(e.target.value)}
                                inputProps={{ min: 0, max: 24, step: 0.5 }}
                                size="small"
                                sx={{ width: 120 }}
                            />
                        </Box>

                        {/* Paid toggle - not shown for unpaid_leave type */}
                        {assignmentType !== 'unpaid_leave' && (
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={isPaid}
                                        onChange={(e) => setIsPaid(e.target.checked)}
                                        color="primary"
                                    />
                                }
                                label={isPaid ? t('dashboard.paid') : t('dashboard.unpaid')}
                            />
                        )}
                    </Box>
                )}

                {/* Description */}
                <TextField
                    fullWidth
                    label={t('timetracker.comment')}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    multiline
                    rows={2}
                    placeholder={isWorkType ? t('timetracker.shiftCommentPlaceholder') : t('timetracker.absenceReasonPlaceholder')}
                    sx={{ mb: 3 }}
                />

                {/* Tasks section - only for work type */}
                {isWorkType && (
                    <>
                        <Divider sx={{ my: 2 }} />

                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                <TimeIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                                {t('timetracker.tasks')}
                            </Typography>
                            <Button
                                startIcon={<AddIcon />}
                                onClick={handleAddTask}
                                variant="outlined"
                                size="small"
                            >
                                {t('timetracker.addTask')}
                            </Button>
                        </Box>

                        {/* Tasks list */}
                        <Box sx={{ maxHeight: 300, overflowY: 'auto', pr: 1 }}>
                            {tasks.map((task, index) => (
                                <Paper
                                    key={index}
                                    elevation={1}
                                    sx={{
                                        p: 2,
                                        mb: 1,
                                        backgroundColor: (theme) => {
                                            const isDark = theme.palette.mode === 'dark';
                                            return task.task_type === 'pause'
                                                ? alpha(theme.palette.warning.main, isDark ? 0.18 : 0.12)
                                                : alpha(theme.palette.success.main, isDark ? 0.18 : 0.12);
                                        },
                                        borderLeft: `4px solid ${task.task_type === 'pause' ? '#ff9800' : '#4caf50'}`
                                    }}
                                >
                                    <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
                                        {/* Task number */}
                                        <Chip
                                            label={`#${index + 1}`}
                                            size="small"
                                            sx={{ fontWeight: 'bold' }}
                                        />

                                        {/* Task type */}
                                        <TextField
                                            select
                                            value={task.task_type}
                                            onChange={(e) => handleTaskChange(index, 'task_type', e.target.value)}
                                            size="small"
                                            sx={{ width: 120 }}
                                        >
                                            <MenuItem value="work">
                                                <Box display="flex" alignItems="center" gap={1}>
                                                    <WorkIcon fontSize="small" color="success" />
                                                    {t('timetracker.work')}
                                                </Box>
                                            </MenuItem>
                                            <MenuItem value="pause">
                                                <Box display="flex" alignItems="center" gap={1}>
                                                    <CoffeeIcon fontSize="small" color="warning" />
                                                    {t('timetracker.pause')}
                                                </Box>
                                            </MenuItem>
                                        </TextField>

                                        {/* Start time */}
                                        <TextField
                                            type="time"
                                            label={t('timetracker.startTime')}
                                            value={task.start_time}
                                            onChange={(e) => handleTaskChange(index, 'start_time', e.target.value)}
                                            size="small"
                                            InputLabelProps={{ shrink: true }}
                                            sx={{ width: 120 }}
                                        />

                                        {/* End time */}
                                        <TextField
                                            type="time"
                                            label={t('timetracker.endTime')}
                                            value={task.end_time}
                                            onChange={(e) => handleTaskChange(index, 'end_time', e.target.value)}
                                            size="small"
                                            InputLabelProps={{ shrink: true }}
                                            sx={{ width: 120 }}
                                        />

                                        {/* Description */}
                                        <TextField
                                            label={t('timetracker.description')}
                                            value={task.description}
                                            onChange={(e) => handleTaskChange(index, 'description', e.target.value)}
                                            size="small"
                                            sx={{ flex: 1, minWidth: 150 }}
                                            placeholder={t('timetracker.whatDidYouDo')}
                                        />

                                        {/* Delete button */}
                                        <Tooltip title={t('timetracker.deleteTask')}>
                                            <span>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleRemoveTask(index)}
                                                    disabled={tasks.length === 1}
                                                    color="error"
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </Box>
                                </Paper>
                            ))}
                        </Box>

                        <Divider sx={{ my: 2 }} />

                        {/* Summary for work type */}
                        {totals && (
                            <Paper
                                elevation={2}
                                sx={{
                                    p: 2,
                                    background: (theme) =>
                                        theme.palette.mode === 'dark'
                                            ? 'linear-gradient(135deg, #1e293b 0%, #334155 100%)'
                                            : 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
                                    borderRadius: 2
                                }}
                            >
                                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                                    {t('timetracker.totalLabel')}
                                </Typography>
                                <Box display="flex" gap={3} flexWrap="wrap">
                                    <Box>
                                        <Typography variant="body2" color="text.secondary">{t('timetracker.workTime')}</Typography>
                                        <Typography variant="h6" color="success.main">
                                            {totals.workTime} ({totals.workHours} {t('timetracker.hoursShort')})
                                        </Typography>
                                    </Box>
                                    <Box>
                                        <Typography variant="body2" color="text.secondary">{t('timetracker.pause')}</Typography>
                                        <Typography variant="h6" color="warning.main">
                                            {totals.pauseTime}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Paper>
                        )}

                        {/* Payment note */}
                        <Alert severity="info" sx={{ mt: 2 }}>
                            {t('timetracker.paymentAutoNote')}
                        </Alert>
                    </>
                )}

                {/* Summary for time-off type */}
                {isTimeOffType && isPaid && (
                    <Box sx={{
                        p: 2,
                        bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'grey.100'),
                        borderRadius: 1,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <Typography variant="body2">
                            {t('timetracker.totalHoursLabel')} <strong>{(daysCount * (parseFloat(hoursPerDay) || 0)).toFixed(1)}</strong>
                        </Typography>
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 2 }}>
                <Button onClick={handleClose} disabled={loading}>
                    {result ? t('common.close') : t('common.cancel')}
                </Button>
                {!result && isWorkType && (
                    <Button
                        variant="outlined"
                        onClick={() => handleSave(true)}
                        disabled={loading || !selectedEmployment}
                        sx={{
                            borderColor: currentTypeInfo?.color || '#667eea',
                            color: currentTypeInfo?.color || '#667eea',
                            '&:hover': {
                                borderColor: currentTypeInfo?.color || '#5a6fd6',
                                backgroundColor: `${currentTypeInfo?.color || '#667eea'}11`
                            }
                        }}
                    >
                        {loading ? t('timetracker.saving') : t('timetracker.saveAndCreateAnother')}
                    </Button>
                )}
                {!result && (
                    <Button
                        variant="contained"
                        onClick={() => handleSave(false)}
                        disabled={loading || !selectedEmployment}
                        sx={{
                            background: `linear-gradient(135deg, ${currentTypeInfo?.color || '#667eea'} 0%, ${currentTypeInfo?.color || '#764ba2'}99 100%)`,
                            '&:hover': {
                                background: `linear-gradient(135deg, ${currentTypeInfo?.color || '#5a6fd6'}dd 0%, ${currentTypeInfo?.color || '#6b4190'}99 100%)`
                            }
                        }}
                    >
                        {loading ? (isWorkType ? t('timetracker.saving') : t('timetracker.creating')) : (isWorkType ? t('common.save') : t('common.create'))}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}

export default CreateAssignmentDialog;
