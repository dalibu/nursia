import React, { useState, useEffect, useMemo } from 'react';
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
    InputAdornment
} from '@mui/material';
import {
    Add as AddIcon,
    Delete as DeleteIcon,
    Work as WorkIcon,
    Coffee as CoffeeIcon,
    AccessTime as TimeIcon,
    Edit as EditIcon
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { ru } from 'date-fns/locale';

const currencySymbols = {
    'UAH': '₴',
    'EUR': '€',
    'USD': '$'
};

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

function ManualAssignmentDialog({
    open,
    onClose,
    onSave,
    employmentList,
    isAdmin,
    onPaymentEdit,  // Callback to open payment edit dialog with payment_id
    initialData = null  // Optional data for cloning
}) {
    // Form state
    const [selectedEmployment, setSelectedEmployment] = useState('');
    const [assignmentDate, setAssignmentDate] = useState(new Date());
    const [hourlyRate, setHourlyRate] = useState('');
    const [currency, setCurrency] = useState('UAH');
    const [description, setDescription] = useState('');
    const [tasks, setTasks] = useState([
        { start_time: '09:00', end_time: '18:00', task_type: 'work', description: '' }
    ]);

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Reset form when dialog opens
    useEffect(() => {
        if (open) {
            setError('');
            setLoading(false);

            if (initialData) {
                // Clone mode: pre-fill with initial data
                setSelectedEmployment(initialData.employment_id || '');
                // Use date from cloned assignment, or today if not provided
                setAssignmentDate(initialData.assignment_date ? new Date(initialData.assignment_date) : new Date());
                setHourlyRate(initialData.hourly_rate || '');
                setCurrency(initialData.currency || 'UAH');
                setDescription(initialData.description || '');

                // Clone tasks if available
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
                // Auto-select employment if only one exists
                if (employmentList.length === 1) {
                    const emp = employmentList[0];
                    setSelectedEmployment(emp.id);
                    setHourlyRate(emp.hourly_rate || '');
                    setCurrency(emp.currency || 'UAH');
                } else {
                    setSelectedEmployment('');
                    setHourlyRate('');
                    setCurrency('UAH');
                }

                setAssignmentDate(new Date());
                setDescription('');
                setTasks([
                    { start_time: '09:00', end_time: '18:00', task_type: 'work', description: '' }
                ]);
            }
        }
    }, [open, employmentList, initialData]);

    // Update rate/currency when employment changes (but not in clone mode)
    useEffect(() => {
        if (selectedEmployment && !initialData) {
            const emp = employmentList.find(e => e.id === selectedEmployment);
            if (emp) {
                setHourlyRate(emp.hourly_rate || '');
                setCurrency(emp.currency || 'UAH');
            }
        }
    }, [selectedEmployment, employmentList, initialData]);

    // Calculate totals
    const totals = useMemo(() => {
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
        const rate = parseFloat(hourlyRate) || 0;
        const amount = workHours * rate;

        return {
            workTime: minutesToDisplay(workMinutes),
            pauseTime: minutesToDisplay(pauseMinutes),
            workHours: workHours.toFixed(2),
            amount: amount.toFixed(2)
        };
    }, [tasks, hourlyRate]);

    // Validate tasks for overlaps
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

    const handleSave = async () => {
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
        if (tasks.length === 0) {
            setError('Добавьте хотя бы одно задание');
            return;
        }

        const validationError = validateTasks();
        if (validationError) {
            setError(validationError);
            return;
        }

        const emp = employmentList.find(e => e.id === selectedEmployment);
        const workerId = emp?.employee_id || emp?.user_id;

        const payload = {
            worker_id: workerId,
            assignment_date: formatDateStr(assignmentDate),
            hourly_rate: parseFloat(hourlyRate) || null,
            currency: currency,
            description: description || null,
            tasks: tasks.map(t => ({
                start_time: t.start_time + ':00',  // Add seconds
                end_time: t.end_time + ':00',
                task_type: t.task_type,
                description: t.description || null
            }))
        };

        setLoading(true);
        try {
            const result = await onSave(payload);

            // If we got a payment, offer to edit it
            if (result?.payment_id && onPaymentEdit) {
                onClose();
                // Show success and offer to edit payment
                onPaymentEdit(result.payment_id, result);
            } else {
                onClose();
            }
        } catch (err) {
            console.error('Failed to create manual assignment:', err);
            setError(err.response?.data?.detail || 'Ошибка при создании смены');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: { borderRadius: 3 }
            }}
        >
            <DialogTitle sx={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                fontWeight: 'bold'
            }}>
                📝 Добавить смену вручную
            </DialogTitle>

            <DialogContent sx={{ pt: 4 }}>
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
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
                                {isAdmin ? emp.employee_name : emp.employer_name}
                            </MenuItem>
                        ))}
                    </TextField>

                    {/* Date picker */}
                    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ru}>
                        <DatePicker
                            label="Дата смены"
                            value={assignmentDate}
                            onChange={setAssignmentDate}
                            slotProps={{
                                textField: {
                                    sx: { minWidth: 150 },
                                    required: true
                                }
                            }}
                        />
                    </LocalizationProvider>

                    {/* Hourly rate */}
                    <TextField
                        label="Ставка"
                        type="number"
                        value={hourlyRate}
                        onChange={(e) => setHourlyRate(e.target.value)}
                        sx={{ width: 120 }}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    /час
                                </InputAdornment>
                            )
                        }}
                    />

                    {/* Currency */}
                    <TextField
                        select
                        label="Валюта"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        sx={{ width: 100 }}
                    >
                        {['UAH', 'EUR', 'USD'].map((curr) => (
                            <MenuItem key={curr} value={curr}>
                                {currencySymbols[curr] || curr}
                            </MenuItem>
                        ))}
                    </TextField>
                </Box>

                {/* Description */}
                <TextField
                    fullWidth
                    label="Комментарий к смене"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    multiline
                    rows={2}
                    placeholder="Опишите смену..."
                    sx={{ mb: 3 }}
                />

                <Divider sx={{ my: 2 }} />

                {/* Tasks section */}
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

                {/* Summary */}
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
                        <Box sx={{ ml: 'auto' }}>
                            <Typography variant="body2" color="text.secondary">К оплате</Typography>
                            <Typography variant="h5" color="primary.main" fontWeight="bold">
                                {currencySymbols[currency] || currency}{totals.amount}
                            </Typography>
                        </Box>
                    </Box>
                </Paper>

                {/* Payment note */}
                <Alert severity="info" sx={{ mt: 2 }}>
                    Платёж будет создан автоматически. После сохранения вы сможете его отредактировать.
                </Alert>
            </DialogContent>

            <DialogActions sx={{ p: 2 }}>
                <Button onClick={onClose} disabled={loading}>
                    Отмена
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={loading || !selectedEmployment}
                    sx={{
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        '&:hover': {
                            background: 'linear-gradient(135deg, #5a6fd6 0%, #6b4190 100%)'
                        }
                    }}
                >
                    {loading ? 'Сохранение...' : 'Сохранить'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default ManualAssignmentDialog;
