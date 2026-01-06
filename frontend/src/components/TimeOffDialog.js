import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Box,
    Typography,
    MenuItem,
    Alert,
    InputAdornment
} from '@mui/material';
import {
    Sick as SickIcon,
    BeachAccess as VacationIcon,
    EventBusy as DayOffIcon,
    MoneyOff as UnpaidIcon
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { ru } from 'date-fns/locale';
import api from '../services/api';

const currencySymbols = {
    'UAH': '₴',
    'EUR': '€',
    'USD': '$'
};

const TIME_OFF_TYPES = [
    { value: 'sick_leave', label: 'Больничный', icon: SickIcon, color: '#f44336' },
    { value: 'vacation', label: 'Отпуск', icon: VacationIcon, color: '#4caf50' },
    { value: 'day_off', label: 'Отгул', icon: DayOffIcon, color: '#ff9800' },
    { value: 'unpaid_leave', label: 'Отпуск за свой счёт', icon: UnpaidIcon, color: '#9e9e9e' }
];

// Helper to format date as YYYY-MM-DD  
const formatDateStr = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

function TimeOffDialog({
    open,
    onClose,
    onSave,
    employmentList,
    isAdmin
}) {
    const [selectedEmployment, setSelectedEmployment] = useState('');
    const [assignmentType, setAssignmentType] = useState('vacation');
    const [startDate, setStartDate] = useState(new Date());
    const [endDate, setEndDate] = useState(new Date());
    const [hoursPerDay, setHoursPerDay] = useState('8');
    const [hourlyRate, setHourlyRate] = useState('');
    const [currency, setCurrency] = useState('UAH');
    const [description, setDescription] = useState('');
    const [isPaid, setIsPaid] = useState(true);

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    // Reset form when dialog opens
    useEffect(() => {
        if (open) {
            setError('');
            setLoading(false);
            setResult(null);
            setAssignmentType('vacation');
            setStartDate(new Date());
            setEndDate(new Date());
            setHoursPerDay('8');
            setDescription('');
            setIsPaid(true);

            // Auto-select employment if only one exists
            if (employmentList.length === 1) {
                const emp = employmentList[0];
                setSelectedEmployment(emp.id);
                setHourlyRate(emp.hourly_rate || '');
                setCurrency(emp.currency || 'UAH');
            } else {
                setSelectedEmployment('');
                setHourlyRate('');
            }
        }
    }, [open, employmentList]);

    // Update rate/currency when employment changes
    useEffect(() => {
        if (selectedEmployment) {
            const emp = employmentList.find(e => e.id === selectedEmployment);
            if (emp) {
                setHourlyRate(emp.hourly_rate || '');
                setCurrency(emp.currency || 'UAH');
            }
        }
    }, [selectedEmployment, employmentList]);

    // Calculate days count
    const daysCount = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1);

    // Calculate total amount
    const totalHours = daysCount * (parseFloat(hoursPerDay) || 0);
    const totalAmount = isPaid ? totalHours * (parseFloat(hourlyRate) || 0) : 0;

    const handleSubmit = async () => {
        if (!selectedEmployment) {
            setError('Выберите работника');
            return;
        }

        if (endDate < startDate) {
            setError('Дата окончания должна быть не раньше даты начала');
            return;
        }

        if (daysCount > 365) {
            setError('Максимальный период: 365 дней');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const emp = employmentList.find(e => e.id === selectedEmployment);

            const payload = {
                worker_id: emp.user_id,
                assignment_type: assignmentType,
                start_date: formatDateStr(startDate),
                end_date: formatDateStr(endDate),
                hourly_rate: isPaid ? parseFloat(hourlyRate) : 0,
                hours_per_day: parseFloat(hoursPerDay),
                currency: currency,
                description: description || null
            };

            const response = await api.post('/assignments/time-off', payload);
            setResult(response.data);

            // Callback to parent
            if (onSave) {
                onSave(response.data);
            }
        } catch (err) {
            setError(err.response?.data?.detail || 'Ошибка при создании записей');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setError('');
        setResult(null);
        onClose();
    };

    const selectedTypeInfo = TIME_OFF_TYPES.find(t => t.value === assignmentType);
    const TypeIcon = selectedTypeInfo?.icon;

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {TypeIcon && <TypeIcon sx={{ color: selectedTypeInfo?.color }} />}
                Создать запись отсутствия
            </DialogTitle>
            <DialogContent>
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

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                    {/* Worker selection */}
                    <TextField
                        select
                        label="Работник"
                        value={selectedEmployment}
                        onChange={(e) => setSelectedEmployment(e.target.value)}
                        fullWidth
                        required
                        disabled={!isAdmin && employmentList.length === 1}
                    >
                        {employmentList.map(emp => (
                            <MenuItem key={emp.id} value={emp.id}>
                                {emp.worker_name || emp.user_name || `ID: ${emp.user_id}`}
                            </MenuItem>
                        ))}
                    </TextField>

                    {/* Type selection */}
                    <TextField
                        select
                        label="Тип записи"
                        value={assignmentType}
                        onChange={(e) => {
                            setAssignmentType(e.target.value);
                            // Auto-set isPaid based on type
                            setIsPaid(e.target.value !== 'unpaid_leave');
                        }}
                        fullWidth
                        required
                    >
                        {TIME_OFF_TYPES.map(type => {
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

                    {/* Date range */}
                    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ru}>
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <DatePicker
                                label="С даты"
                                value={startDate}
                                onChange={(date) => {
                                    setStartDate(date);
                                    if (date > endDate) {
                                        setEndDate(date);
                                    }
                                }}
                                format="dd.MM.yyyy"
                                slotProps={{ textField: { fullWidth: true } }}
                            />
                            <DatePicker
                                label="По дату"
                                value={endDate}
                                onChange={(date) => setEndDate(date)}
                                minDate={startDate}
                                format="dd.MM.yyyy"
                                slotProps={{ textField: { fullWidth: true } }}
                            />
                        </Box>
                    </LocalizationProvider>

                    {/* Days count display */}
                    <Typography variant="body2" color="text.secondary">
                        Количество дней: <strong>{daysCount}</strong>
                    </Typography>

                    {/* Paid toggle for appropriate types */}
                    {assignmentType !== 'unpaid_leave' && (
                        <TextField
                            select
                            label="Оплата"
                            value={isPaid ? 'paid' : 'unpaid'}
                            onChange={(e) => setIsPaid(e.target.value === 'paid')}
                            fullWidth
                        >
                            <MenuItem value="paid">Оплачиваемый</MenuItem>
                            <MenuItem value="unpaid">Неоплачиваемый</MenuItem>
                        </TextField>
                    )}

                    {/* Hours per day and rate for paid types */}
                    {isPaid && assignmentType !== 'unpaid_leave' && (
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                label="Часов в день"
                                type="number"
                                value={hoursPerDay}
                                onChange={(e) => setHoursPerDay(e.target.value)}
                                inputProps={{ min: 0, max: 24, step: 0.5 }}
                                sx={{ width: 140 }}
                            />
                            <TextField
                                label="Ставка"
                                type="number"
                                value={hourlyRate}
                                onChange={(e) => setHourlyRate(e.target.value)}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            {currencySymbols[currency] || currency}/час
                                        </InputAdornment>
                                    )
                                }}
                                sx={{ flex: 1 }}
                            />
                        </Box>
                    )}

                    {/* Description */}
                    <TextField
                        label="Описание"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        multiline
                        rows={2}
                        fullWidth
                    />

                    {/* Total calculation */}
                    {isPaid && assignmentType !== 'unpaid_leave' && (
                        <Box sx={{
                            p: 2,
                            bgcolor: 'grey.100',
                            borderRadius: 1,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <Typography variant="body2">
                                Всего часов: <strong>{totalHours.toFixed(1)}</strong>
                            </Typography>
                            <Typography variant="h6" color="primary">
                                {totalAmount.toFixed(2)} {currencySymbols[currency] || currency}
                            </Typography>
                        </Box>
                    )}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>
                    {result ? 'Закрыть' : 'Отмена'}
                </Button>
                {!result && (
                    <Button
                        variant="contained"
                        onClick={handleSubmit}
                        disabled={loading || !selectedEmployment}
                    >
                        {loading ? 'Создание...' : 'Создать'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}

export default TimeOffDialog;
