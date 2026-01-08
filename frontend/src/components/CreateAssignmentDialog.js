import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { ru } from 'date-fns/locale';
import api from '../services/api';

// Assignment types configuration
const ASSIGNMENT_TYPES = [
    { value: 'work', label: 'Рабочая смена', icon: WorkIcon, color: '#4caf50', category: 'work' },
    { value: 'sick_leave', label: 'Больничный', icon: SickIcon, color: '#f44336', category: 'time_off' },
    { value: 'vacation', label: 'Отпуск', icon: VacationIcon, color: '#2196f3', category: 'time_off' },
    { value: 'day_off', label: 'Отгул', icon: DayOffIcon, color: '#ff9800', category: 'time_off' },
    { value: 'unpaid_leave', label: 'Отпуск за свой счёт', icon: UnpaidIcon, color: '#9e9e9e', category: 'time_off' }
];

// Helper to format time input for display
const formatTimeDisplay = (timeStr) => {
    if (!timeStr) return '';
    return timeStr.substring(0, 5);
};

// Helper to format date as YYYY-MM-DD  
const formatDateStr = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
                setTasks(initialData.tasks.map(t => ({
                    start_time: t.start_time || '09:00',
                    end_time: t.end_time || '18:00',
                    task_type: t.task_type || 'work',
                    description: t.description || ''
                })));
            } else {
                setTasks([
                    { start_time: '09:00', end_time: '18:00', task_type: 'work', description: initialData.description || '' }
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
                { start_time: '09:00', end_time: '18:00', task_type: 'work', description: '' }
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
                return `Задание #${i + 1}: укажите время начала и окончания`;
            }
            const start = timeToMinutes(task.start_time);
            const end = timeToMinutes(task.end_time);
            if (end <= start) {
                return `Задание #${i + 1}: время окончания должно быть позже времени начала`;
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
                    return `Задания #${i + 1} и #${j + 1} пересекаются по времени`;
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
            setError('Выберите работника');
            return;
        }
        if (!assignmentDate) {
            setError('Укажите дату');
            return;
        }

        const emp = employmentList.find(e => e.id === selectedEmployment);
        const workerId = emp?.employee_id || emp?.user_id;

        if (isWorkType) {
            // Work type validation and submission
            if (tasks.length === 0) {
                setError('Добавьте хотя бы одно задание');
                return;
            }

            const validationError = validateTasks();
            if (validationError) {
                setError(validationError);
                return;
            }

            const dateStr = formatDateStr(assignmentDate);

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
                const result = await onSave(payload);

                if (keepOpen) {
                    // Prepare new clone data for next iteration
                    const newCloneData = {
                        employment_id: selectedEmployment,
                        assignment_type: assignmentType,
                        assignment_date: formatDateStr(assignmentDate),
                        description: description || '',
                        tasks: tasks.map(t => ({
                            start_time: t.start_time,
                            end_time: t.end_time,
                            task_type: t.task_type,
                            description: t.description || ''
                        }))
                    };
                    await onSave(payload, true, newCloneData);
                } else {
                    // Close dialog and notify about created assignment
                    onClose();
                    if (result?.assignment_id && onAssignmentCreated) {
                        onAssignmentCreated(result.assignment_id);
                    }
                }
            } catch (err) {
                console.error('Failed to create assignment:', err);
                setError(err.response?.data?.detail || 'Ошибка при создании смены');
            } finally {
                setLoading(false);
            }
        } else {
            // Time-off type validation and submission
            if (endDate < assignmentDate) {
                setError('Дата окончания должна быть не раньше даты начала');
                return;
            }

            if (daysCount > 365) {
                setError('Максимальный период: 365 дней');
                return;
            }

            setLoading(true);
            try {
                const startDateTime = new Date(assignmentDate);
                startDateTime.setHours(0, 0, 0, 0);

                const endDateTime = new Date(endDate);
                endDateTime.setHours(parseInt(hoursPerDay) || 8, 0, 0, 0);

                const payload = {
                    worker_id: workerId,
                    assignment_type: assignmentType,
                    start_time: startDateTime.toISOString(),
                    end_time: endDateTime.toISOString(),
                    description: description || null,
                    is_paid: isPaid
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
                    setError('Ошибка при создании записей');
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
                Создать запись
            </DialogTitle>

            <DialogContent sx={{ pt: 4 }}>
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                {result && (
                    <Alert severity="success" sx={{ mb: 2 }}>
                        Создано записей: {result.created_count}
                        {result.skipped_dates?.length > 0 && (
                            <Typography variant="caption" display="block">
                                Пропущено (уже существует): {result.skipped_dates.join(', ')}
                            </Typography>
                        )}
                    </Alert>
                )}

                {/* Basic info section */}
                <Box display="flex" gap={2} flexWrap="wrap" mb={3} mt={2}>
                    {/* Employment selector */}
                    <TextField
                        select
                        label={isAdmin ? "Работник" : "Трудовые отношения"}
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
                        label="Тип записи"
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
                                        {type.label}
                                    </Box>
                                </MenuItem>
                            );
                        })}
                    </TextField>
                </Box>

                {/* Date picker(s) */}
                <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ru}>
                    <Box display="flex" gap={2} mb={3}>
                        <DatePicker
                            label={isTimeOffType ? "С даты" : "Дата смены"}
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
                                label="По дату"
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
                                Количество дней: <strong>{daysCount}</strong>
                            </Typography>
                            <TextField
                                label="Часов в день"
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
                                label={isPaid ? "Оплачиваемый" : "Неоплачиваемый"}
                            />
                        )}
                    </Box>
                )}

                {/* Description */}
                <TextField
                    fullWidth
                    label="Комментарий"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    multiline
                    rows={2}
                    placeholder={isWorkType ? "Опишите смену..." : "Причина отсутствия..."}
                    sx={{ mb: 3 }}
                />

                {/* Tasks section - only for work type */}
                {isWorkType && (
                    <>
                        <Divider sx={{ my: 2 }} />

                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                <TimeIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                                Задания
                            </Typography>
                            <Button
                                startIcon={<AddIcon />}
                                onClick={handleAddTask}
                                variant="outlined"
                                size="small"
                            >
                                Добавить задание
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
                                        backgroundColor: task.task_type === 'pause' ? '#fff3e0' : '#e8f5e9',
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
                                                    Работа
                                                </Box>
                                            </MenuItem>
                                            <MenuItem value="pause">
                                                <Box display="flex" alignItems="center" gap={1}>
                                                    <CoffeeIcon fontSize="small" color="warning" />
                                                    Пауза
                                                </Box>
                                            </MenuItem>
                                        </TextField>

                                        {/* Start time */}
                                        <TextField
                                            type="time"
                                            label="Начало"
                                            value={task.start_time}
                                            onChange={(e) => handleTaskChange(index, 'start_time', e.target.value)}
                                            size="small"
                                            InputLabelProps={{ shrink: true }}
                                            sx={{ width: 120 }}
                                        />

                                        {/* End time */}
                                        <TextField
                                            type="time"
                                            label="Конец"
                                            value={task.end_time}
                                            onChange={(e) => handleTaskChange(index, 'end_time', e.target.value)}
                                            size="small"
                                            InputLabelProps={{ shrink: true }}
                                            sx={{ width: 120 }}
                                        />

                                        {/* Description */}
                                        <TextField
                                            label="Описание"
                                            value={task.description}
                                            onChange={(e) => handleTaskChange(index, 'description', e.target.value)}
                                            size="small"
                                            sx={{ flex: 1, minWidth: 150 }}
                                            placeholder="Что делали..."
                                        />

                                        {/* Delete button */}
                                        <Tooltip title="Удалить задание">
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
                                    background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
                                    borderRadius: 2
                                }}
                            >
                                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                                    📊 Итого:
                                </Typography>
                                <Box display="flex" gap={3} flexWrap="wrap">
                                    <Box>
                                        <Typography variant="body2" color="text.secondary">Рабочее время</Typography>
                                        <Typography variant="h6" color="success.main">
                                            {totals.workTime} ({totals.workHours} ч)
                                        </Typography>
                                    </Box>
                                    <Box>
                                        <Typography variant="body2" color="text.secondary">Пауза</Typography>
                                        <Typography variant="h6" color="warning.main">
                                            {totals.pauseTime}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Paper>
                        )}

                        {/* Payment note */}
                        <Alert severity="info" sx={{ mt: 2 }}>
                            Платёж будет создан автоматически. После сохранения вы сможете его отредактировать.
                        </Alert>
                    </>
                )}

                {/* Summary for time-off type */}
                {isTimeOffType && isPaid && (
                    <Box sx={{
                        p: 2,
                        bgcolor: 'grey.100',
                        borderRadius: 1,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <Typography variant="body2">
                            Всего часов: <strong>{(daysCount * (parseFloat(hoursPerDay) || 0)).toFixed(1)}</strong>
                        </Typography>
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 2 }}>
                <Button onClick={handleClose} disabled={loading}>
                    {result ? 'Закрыть' : 'Отмена'}
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
                        {loading ? 'Сохранение...' : 'Сохранить и создать ещё'}
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
                        {loading ? (isWorkType ? 'Сохранение...' : 'Создание...') : (isWorkType ? 'Сохранить' : 'Создать')}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}

export default CreateAssignmentDialog;
