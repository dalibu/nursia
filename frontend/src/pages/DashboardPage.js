import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, MenuItem, Button, IconButton, Tooltip
} from '@mui/material';
import { Settings, AccountCircle, AccessTime, Payment, Info } from '@mui/icons-material';
import { dashboard, payments, employment } from '../services/api';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useActiveSession } from '../context/ActiveSessionContext';
import '../styles/pages.css';

// Символы валют
const currencySymbols = {
    'UAH': '₴',
    'EUR': '€',
    'USD': '$'
};

function DashboardPage() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    // Диалоги
    const [timeModalOpen, setTimeModalOpen] = useState(false);
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [selectedWorker, setSelectedWorker] = useState(null);

    // Форма времени
    const [timeForm, setTimeForm] = useState({
        worker_id: '',
        date: new Date().toISOString().split('T')[0],
        hours: '',
        type: 'work',
        comment: ''
    });

    // Форма платежа
    const [paymentForm, setPaymentForm] = useState({
        worker_id: '',
        category: 'salary',
        date: new Date().toISOString().split('T')[0],
        amount: '',
        comment: ''
    });

    // Категории платежей
    const [categories, setCategories] = useState([]);

    const { subscribe } = useWebSocket();
    const { activeSession } = useActiveSession();

    const formatCurrency = (amount, currency = 'UAH') => {
        const value = Number(amount);
        const symbol = currencySymbols[currency] || currency;
        return (
            <>
                {value.toLocaleString('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                <span style={{ fontWeight: 400 }}> {symbol}</span>
            </>
        );
    };

    const loadData = useCallback(async (showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            const [dashboardRes, categoriesRes] = await Promise.all([
                dashboard.getData(),
                payments.categories()
            ]);
            setData(dashboardRes.data);
            setCategories(categoriesRes.data || []);
            setError(null);
        } catch (err) {
            console.error('Failed to load dashboard data:', err);
            setError('Ошибка загрузки данных');
        } finally {
            if (showLoading) setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // WebSocket updates
    useEffect(() => {
        const unsubscribe = subscribe(
            ['payment_created', 'payment_updated', 'payment_deleted', 'assignment_started', 'assignment_stopped'],
            () => loadData(false)
        );
        return () => unsubscribe();
    }, [subscribe, loadData]);

    // Открыть модал времени для конкретного работника
    const handleOpenTimeModal = (worker = null) => {
        if (worker) {
            setTimeForm(prev => ({ ...prev, worker_id: worker.id }));
            setSelectedWorker(worker);
        }
        setTimeModalOpen(true);
    };

    // Открыть модал платежа для конкретного работника
    const handleOpenPaymentModal = (worker = null, amount = null) => {
        if (worker) {
            setPaymentForm(prev => ({
                ...prev,
                worker_id: worker.id,
                amount: amount ? Math.abs(amount).toString() : ''
            }));
            setSelectedWorker(worker);
        }
        setPaymentModalOpen(true);
    };

    // Сохранить время (заглушка)
    const handleSaveTime = async () => {
        console.log('Save time:', timeForm);
        setTimeModalOpen(false);
        // TODO: Implement time creation
        loadData(false);
    };

    // Сохранить платеж (заглушка)
    const handleSavePayment = async () => {
        console.log('Save payment:', paymentForm);
        setPaymentModalOpen(false);
        // TODO: Implement payment creation
        loadData(false);
    };

    // Показать детали работника
    const handleShowDetails = (worker) => {
        console.log('Show details:', worker);
        // TODO: Navigate to details page or open modal
    };

    if (loading) {
        return (
            <div className="nursia-container">
                <Box className="nursia-loading">
                    <CircularProgress sx={{ color: '#3b82f6' }} />
                </Box>
            </div>
        );
    }

    if (error) {
        return (
            <div className="nursia-container">
                <Box className="nursia-error">
                    <p>{error}</p>
                    <Button onClick={() => loadData()}>Повторить</Button>
                </Box>
            </div>
        );
    }

    const { summary, workers, is_employer } = data || {};

    // API возвращает: положительное = работодатель должен работнику
    // Для отображения: + = тебе должны (хорошо), - = ты должен (плохо)
    // Поэтому для работодателя инвертируем знак
    const rawBalance = (summary?.balance || 0);
    const balanceForDisplay = is_employer ? -rawBalance : rawBalance;
    // Единая семантика: + = зелёный (хорошо), - = красный (плохо)
    const balanceColor = balanceForDisplay >= 0 ? '#10b981' : '#ef4444';

    return (
        <div className="nursia-container">
            {/* Summary Cards */}
            <div className="nursia-summary-cards">
                <div className="nursia-summary-card">
                    <h3>Смены</h3>
                    <div className="nursia-amount" style={{ color: '#3b82f6' }}>
                        {summary?.shifts || 0}
                    </div>
                </div>
                <div className="nursia-summary-card">
                    <h3>Часы</h3>
                    <div className="nursia-amount" style={{ color: '#3b82f6' }}>
                        {summary?.hours?.toFixed(2) || 0}
                    </div>
                </div>
                <div className="nursia-summary-card">
                    <h3>Зарплата</h3>
                    <div className="nursia-amount" style={{ color: '#2dbfc4' }}>
                        {formatCurrency(summary?.salary || 0)}
                    </div>
                </div>
                <div className="nursia-summary-card">
                    <h3>Кредиты / Авансы</h3>
                    <div className="nursia-amount" style={{ color: '#7469eb' }}>
                        {formatCurrency(summary?.credits || 0)}
                    </div>
                </div>
                <div className="nursia-summary-card">
                    <h3>Премии / Подарки</h3>
                    <div className="nursia-amount" style={{ color: '#2e54fe' }}>
                        {formatCurrency(summary?.bonuses || 0)}
                    </div>
                </div>
                <div className="nursia-summary-card">
                    <h3>Расходы</h3>
                    <div className="nursia-amount" style={{ color: '#bc1db4' }}>
                        {formatCurrency(summary?.expenses || 0)}
                    </div>
                </div>
                <div className="nursia-summary-card">
                    <h3>Неоплачено</h3>
                    <div className="nursia-amount" style={{ color: '#f59e0b' }}>
                        {formatCurrency(summary?.unpaid || 0)}
                    </div>
                </div>
                <div className="nursia-summary-card">
                    <h3>Выплачено</h3>
                    <div className="nursia-amount" style={{ color: 'var(--amount-white)' }}>
                        {formatCurrency(summary?.paid || 0)}
                    </div>
                </div>
                <div className="nursia-summary-card">
                    <h3>Сальдо</h3>
                    <div 
                        className="nursia-amount" 
                        style={{ color: balanceColor }}
                    >
                        {balanceForDisplay >= 0 ? '+' : ''}{formatCurrency(balanceForDisplay)}
                    </div>
                </div>
            </div>

            {/* Worker Cards */}
            <div className="nursia-workers-grid">
                {workers?.map(worker => {
                    // API: due > 0 = работодатель должен работнику
                    // Отображение: + = тебе должны (хорошо), - = ты должен (плохо)
                    const workerDue = worker.balance.due;
                    // Для работодателя инвертируем знак (его расход = минус)
                    const dueForDisplay = is_employer ? -workerDue : workerDue;
                    // Единая семантика: + = зелёный (хорошо), - = красный (плохо)
                    const balanceColor = dueForDisplay >= 0 ? '#10b981' : '#ef4444';
                    const isGreen = dueForDisplay >= 0;
                    
                    // Пропускаем карточку, если нет никаких платежей
                    const hasPayments = worker.balance.accrued > 0 || worker.balance.paid > 0 || 
                                       worker.balance.expenses > 0 || worker.balance.bonuses > 0 || 
                                       worker.balance.salary_unpaid > 0 || worker.balance.credits_given > 0 ||
                                       worker.stats.shifts > 0 || worker.stats.hours > 0;
                    
                    if (!hasPayments) return null;
                    
                    return (
                    <div key={worker.id} className="nursia-worker-card">
                        <div className="nursia-worker-header">
                            <div className="nursia-worker-name">
                                {worker.avatar} {worker.name}
                            </div>
                            <div className="nursia-worker-actions-header">
                                <Tooltip title="Время">
                                    <IconButton
                                        onClick={() => handleOpenTimeModal(worker)}
                                    >
                                        <AccessTime />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Платеж">
                                    <IconButton
                                        onClick={() => handleOpenPaymentModal(worker)}
                                    >
                                        <Payment />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Детали">
                                    <IconButton
                                        onClick={() => handleShowDetails(worker)}
                                    >
                                        <Info />
                                    </IconButton>
                                </Tooltip>
                            </div>
                        </div>

                        <div className="nursia-worker-body">
                            {/* Balance Block */}
                            <div className={`nursia-balance-main ${isGreen ? 'positive' : 'negative'}`}>
                                <div className="nursia-balance-label">Баланс</div>
                                <div
                                    className="nursia-balance-amount"
                                    style={{ color: balanceColor }}
                                >
                                    {formatCurrency(Math.abs(dueForDisplay))}
                                </div>
                                <div className="nursia-balance-breakdown">
                                    <div className="nursia-breakdown-item">
                                        <span>Начислено</span>
                                        <span>{formatCurrency(worker.balance.accrued || worker.balance.salary)}</span>
                                    </div>
                                    <div className="nursia-breakdown-item">
                                        <span>Выплачено</span>
                                        <span>{formatCurrency(worker.balance.paid || 0)}</span>
                                    </div>
                                    {worker.balance.expenses > 0 && (
                                        <div className="nursia-breakdown-item">
                                            <span>Расходы</span>
                                            <span>{formatCurrency(worker.balance.expenses)}</span>
                                        </div>
                                    )}
                                    {worker.balance.bonuses > 0 && (
                                        <div className="nursia-breakdown-item">
                                            <span>Премии</span>
                                            <span>{formatCurrency(worker.balance.bonuses)}</span>
                                        </div>
                                    )}
                                    <div className="nursia-breakdown-divider"></div>
                                    <div
                                        className="nursia-breakdown-item nursia-breakdown-total"
                                        style={{ color: balanceColor }}
                                    >
                                        <span>{workerDue < 0 ? 'Переплачено' : 'Недоплачено'}</span>
                                        <span>{formatCurrency(Math.abs(dueForDisplay))}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Stats Compact */}
                            <div className="nursia-stats-compact">
                                <div className="nursia-stat-compact">
                                    <div className="nursia-stat-compact-label">Часов</div>
                                    <div className="nursia-stat-compact-value">{worker.stats.hours}</div>
                                </div>
                                <div className="nursia-stat-compact">
                                    <div className="nursia-stat-compact-label">Начислено</div>
                                    <div className="nursia-stat-compact-value">{formatCurrency(worker.stats.accrued)}</div>
                                </div>
                                <div className="nursia-stat-compact">
                                    <div className="nursia-stat-compact-label">Выплачено</div>
                                    <div className="nursia-stat-compact-value">{formatCurrency(worker.stats.paid)}</div>
                                </div>
                                <div className="nursia-stat-compact">
                                    <div className="nursia-stat-compact-label">Расходы</div>
                                    <div className="nursia-stat-compact-value">{formatCurrency(worker.stats.expenses)}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    );
                })}
            </div>

            {/* Time Modal */}
            <Dialog
                open={timeModalOpen}
                onClose={() => setTimeModalOpen(false)}
                PaperProps={{ className: 'nursia-modal-content' }}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>⏱️ Добавить время</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                        <TextField
                            select
                            label="Работник"
                            value={timeForm.worker_id}
                            onChange={(e) => setTimeForm({ ...timeForm, worker_id: e.target.value })}
                            fullWidth
                        >
                            {workers?.map(w => (
                                <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            type="date"
                            label="Дата"
                            value={timeForm.date}
                            onChange={(e) => setTimeForm({ ...timeForm, date: e.target.value })}
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                        />
                        <TextField
                            type="number"
                            label="Часов"
                            value={timeForm.hours}
                            onChange={(e) => setTimeForm({ ...timeForm, hours: e.target.value })}
                            fullWidth
                            inputProps={{ step: 0.5 }}
                        />
                        <TextField
                            select
                            label="Тип записи"
                            value={timeForm.type}
                            onChange={(e) => setTimeForm({ ...timeForm, type: e.target.value })}
                            fullWidth
                        >
                            <MenuItem value="work">Работа</MenuItem>
                            <MenuItem value="vacation">Отпуск</MenuItem>
                            <MenuItem value="day_off">Отгул</MenuItem>
                            <MenuItem value="sick_leave">Больничный</MenuItem>
                        </TextField>
                        <TextField
                            label="Комментарий"
                            value={timeForm.comment}
                            onChange={(e) => setTimeForm({ ...timeForm, comment: e.target.value })}
                            fullWidth
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setTimeModalOpen(false)}>Отмена</Button>
                    <Button onClick={handleSaveTime} variant="contained" color="primary">Сохранить</Button>
                </DialogActions>
            </Dialog>

            {/* Payment Modal */}
            <Dialog
                open={paymentModalOpen}
                onClose={() => setPaymentModalOpen(false)}
                PaperProps={{ className: 'nursia-modal-content' }}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>💰 Выплата / Аванс</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                        <TextField
                            select
                            label="Работник"
                            value={paymentForm.worker_id}
                            onChange={(e) => setPaymentForm({ ...paymentForm, worker_id: e.target.value })}
                            fullWidth
                        >
                            {workers?.map(w => (
                                <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            select
                            label="Тип выплаты"
                            value={paymentForm.category}
                            onChange={(e) => setPaymentForm({ ...paymentForm, category: e.target.value })}
                            fullWidth
                        >
                            <MenuItem value="salary">Зарплата</MenuItem>
                            <MenuItem value="bonus">Премия</MenuItem>
                            <MenuItem value="debt">Аванс</MenuItem>
                            <MenuItem value="expense">Компенсация расходов</MenuItem>
                        </TextField>
                        <TextField
                            type="date"
                            label="Дата"
                            value={paymentForm.date}
                            onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                        />
                        <TextField
                            type="number"
                            label="Сумма (₴)"
                            value={paymentForm.amount}
                            onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                            fullWidth
                            inputProps={{ step: 0.01 }}
                        />
                        <TextField
                            label="Комментарий"
                            value={paymentForm.comment}
                            onChange={(e) => setPaymentForm({ ...paymentForm, comment: e.target.value })}
                            fullWidth
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPaymentModalOpen(false)}>Отмена</Button>
                    <Button onClick={handleSavePayment} variant="contained" color="primary">Сохранить</Button>
                </DialogActions>
            </Dialog>
        </div>
    );
}

export default DashboardPage;
