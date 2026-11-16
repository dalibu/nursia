import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Button, IconButton, Tooltip
} from '@mui/material';
import { AccessTime, Payment, Info } from '@mui/icons-material';
import { dashboard, payments } from '../services/api';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useActiveSession } from '../context/ActiveSessionContext';
import '../styles/pages.css';

const currencySymbols = {
  'UAH': '₴',
  'EUR': '€',
  'USD': '$'
};

function DashboardPage() {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const [timeModalOpen, setTimeModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState(null);

  const [timeForm, setTimeForm] = useState({
    worker_id: '',
    date: new Date().toISOString().split('T')[0],
    hours: '',
    type: 'work',
    comment: ''
  });

  const [paymentForm, setPaymentForm] = useState({
    worker_id: '',
    category: 'salary',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    comment: ''
  });

  const [categories, setCategories] = useState([]);

  const { subscribe } = useWebSocket();
  const { activeSession } = useActiveSession();

  const currentLocale = i18n.language === 'uk' ? 'uk-UA' : i18n.language || 'uk-UA';

  const formatCurrency = (amount, currency = 'UAH') => {
    const value = Number(amount);
    const symbol = currencySymbols[currency] || currency;
    return (
      <>
        {value.toLocaleString(currentLocale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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
      setError(t('dashboard.loadError'));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const unsubscribe = subscribe(
      ['payment_created', 'payment_updated', 'payment_deleted', 'assignment_started', 'assignment_stopped'],
      () => loadData(false)
    );
    return () => unsubscribe();
  }, [subscribe, loadData]);

  const handleOpenTimeModal = (worker = null) => {
    if (worker) {
      setTimeForm(prev => ({ ...prev, worker_id: worker.id }));
      setSelectedWorker(worker);
    }
    setTimeModalOpen(true);
  };

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

  const handleSaveTime = async () => {
    console.log('Save time:', timeForm);
    setTimeModalOpen(false);
    loadData(false);
  };

  const handleSavePayment = async () => {
    console.log('Save payment:', paymentForm);
    setPaymentModalOpen(false);
    loadData(false);
  };

  const handleShowDetails = (worker) => {
    console.log('Show details:', worker);
  };

  if (loading) {
    return (
      <div className="nursia-container">
        <Box className="nursia-loading">
          <CircularProgress sx={{ color: 'var(--accent-blue)' }} />
        </Box>
      </div>
    );
  }

  if (error) {
    return (
      <div className="nursia-container">
        <Box className="nursia-error">
          <p>{error}</p>
          <Button onClick={() => loadData()}>{t('dashboard.retry')}</Button>
        </Box>
      </div>
    );
  }

  const { summary, workers, is_employer } = data || {};
  const rawBalance = (summary?.balance || 0);
  const balanceForDisplay = is_employer ? -rawBalance : rawBalance;
  const balanceColor = balanceForDisplay >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';

  return (
    <div className="nursia-container">
      {/* Summary Cards */}
      <div className="nursia-summary-cards">
        <div className="nursia-summary-card">
          <h3>{t('dashboard.shifts')}</h3>
          <div className="nursia-amount" style={{ color: 'var(--accent-blue)' }}>{summary?.shifts || 0}</div>
        </div>
        <div className="nursia-summary-card">
          <h3>{t('dashboard.hours')}</h3>
          <div className="nursia-amount" style={{ color: 'var(--accent-blue)' }}>{summary?.hours?.toFixed(2) || 0}</div>
        </div>
        <div className="nursia-summary-card">
          <h3>{t('dashboard.salary')}</h3>
          <div className="nursia-amount" style={{ color: 'var(--accent-cyan)' }}>{formatCurrency(summary?.salary || 0)}</div>
        </div>
        <div className="nursia-summary-card">
          <h3>{t('dashboard.creditsAdvances')}</h3>
          <div className="nursia-amount" style={{ color: 'var(--accent-purple)' }}>{formatCurrency(summary?.credits || 0)}</div>
        </div>
        <div className="nursia-summary-card">
          <h3>{t('dashboard.bonusesGifts')}</h3>
          <div className="nursia-amount" style={{ color: 'var(--accent-blue)' }}>{formatCurrency(summary?.bonuses || 0)}</div>
        </div>
        <div className="nursia-summary-card">
          <h3>{t('dashboard.expenses')}</h3>
          <div className="nursia-amount" style={{ color: 'var(--accent-purple)' }}>{formatCurrency(summary?.expenses || 0)}</div>
        </div>
        <div className="nursia-summary-card">
          <h3>{t('dashboard.unpaid')}</h3>
          <div className="nursia-amount" style={{ color: 'var(--accent-yellow)' }}>{formatCurrency(summary?.unpaid || 0)}</div>
        </div>
        <div className="nursia-summary-card">
          <h3>{t('dashboard.paid')}</h3>
          <div className="nursia-amount" style={{ color: 'var(--amount-white)' }}>{formatCurrency(summary?.paid || 0)}</div>
        </div>
        <div className="nursia-summary-card">
          <h3>{t('dashboard.balance')}</h3>
          <div className="nursia-amount" style={{ color: balanceColor }}>
            {balanceForDisplay >= 0 ? '+' : ''}{formatCurrency(balanceForDisplay)}
          </div>
        </div>
      </div>

      {/* Worker Cards */}
      <div className="nursia-workers-grid">
        {workers?.map(worker => {
          const workerDue = worker.balance.due;
          const dueForDisplay = is_employer ? -workerDue : workerDue;
          const cardBalanceColor = dueForDisplay >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
          const isGreen = dueForDisplay >= 0;

          const hasPayments = worker.balance.accrued > 0 || worker.balance.paid > 0 ||
            worker.balance.expenses > 0 || worker.balance.bonuses > 0 ||
            worker.balance.salary_unpaid > 0 || worker.balance.credits_given > 0 ||
            worker.stats.shifts > 0 || worker.stats.hours > 0;

          if (!hasPayments) return null;

          return (
            <div key={worker.id} className="nursia-worker-card">
              <div className="nursia-worker-header">
                <div className="nursia-worker-name">{worker.avatar} {worker.name}</div>
                <div className="nursia-worker-actions-header">
                  <Tooltip title={t('dashboard.timeTooltip')}>
                    <IconButton onClick={() => handleOpenTimeModal(worker)}><AccessTime /></IconButton>
                  </Tooltip>
                  <Tooltip title={t('dashboard.paymentTooltip')}>
                    <IconButton onClick={() => handleOpenPaymentModal(worker)}><Payment /></IconButton>
                  </Tooltip>
                  <Tooltip title={t('dashboard.detailsTooltip')}>
                    <IconButton onClick={() => handleShowDetails(worker)}><Info /></IconButton>
                  </Tooltip>
                </div>
              </div>

              <div className="nursia-worker-body">
                <div className={`nursia-balance-main ${isGreen ? 'positive' : 'negative'}`}>
                  <div className="nursia-balance-label">{t('dashboard.balanceLabel')}</div>
                  <div className="nursia-balance-amount" style={{ color: cardBalanceColor }}>
                    {formatCurrency(Math.abs(dueForDisplay))}
                  </div>
                  <div className="nursia-balance-breakdown">
                    <div className="nursia-breakdown-item">
                      <span>{t('dashboard.accrued')}</span>
                      <span>{formatCurrency(worker.balance.accrued || worker.balance.salary)}</span>
                    </div>
                    <div className="nursia-breakdown-item">
                      <span>{t('dashboard.paid')}</span>
                      <span>{formatCurrency(worker.balance.paid || 0)}</span>
                    </div>
                    {worker.balance.expenses > 0 && (
                      <div className="nursia-breakdown-item">
                        <span>{t('dashboard.expenses')}</span>
                        <span>{formatCurrency(worker.balance.expenses)}</span>
                      </div>
                    )}
                    {worker.balance.bonuses > 0 && (
                      <div className="nursia-breakdown-item">
                        <span>{t('dashboard.bonuses')}</span>
                        <span>{formatCurrency(worker.balance.bonuses)}</span>
                      </div>
                    )}
                    <div className="nursia-breakdown-divider"></div>
                    <div className="nursia-breakdown-item nursia-breakdown-total" style={{ color: cardBalanceColor }}>
                      <span>{workerDue < 0 ? t('dashboard.overpaid') : t('dashboard.underpaid')}</span>
                      <span>{formatCurrency(Math.abs(dueForDisplay))}</span>
                    </div>
                  </div>
                </div>

                <div className="nursia-stats-compact">
                  <div className="nursia-stat-compact">
                    <div className="nursia-stat-compact-label">{t('dashboard.hoursGenitive')}</div>
                    <div className="nursia-stat-compact-value">{worker.stats.hours}</div>
                  </div>
                  <div className="nursia-stat-compact">
                    <div className="nursia-stat-compact-label">{t('dashboard.accrued')}</div>
                    <div className="nursia-stat-compact-value">{formatCurrency(worker.stats.accrued)}</div>
                  </div>
                  <div className="nursia-stat-compact">
                    <div className="nursia-stat-compact-label">{t('dashboard.paid')}</div>
                    <div className="nursia-stat-compact-value">{formatCurrency(worker.stats.paid)}</div>
                  </div>
                  <div className="nursia-stat-compact">
                    <div className="nursia-stat-compact-label">{t('dashboard.expenses')}</div>
                    <div className="nursia-stat-compact-value">{formatCurrency(worker.stats.expenses)}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Time Modal */}
      <Dialog open={timeModalOpen} onClose={() => setTimeModalOpen(false)} PaperProps={{ className: 'nursia-modal-content' }} maxWidth="sm" fullWidth>
        <DialogTitle>⏱️ {t('dashboard.addTimeTitle')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField select label={t('dashboard.worker')} value={timeForm.worker_id} onChange={(e) => setTimeForm({ ...timeForm, worker_id: e.target.value })} fullWidth>
              {workers?.map(w => (<MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>))}
            </TextField>
            <TextField type="date" label={t('dashboard.date')} value={timeForm.date} onChange={(e) => setTimeForm({ ...timeForm, date: e.target.value })} fullWidth InputLabelProps={{ shrink: true }} />
            <TextField type="number" label={t('dashboard.hoursGenitive')} value={timeForm.hours} onChange={(e) => setTimeForm({ ...timeForm, hours: e.target.value })} fullWidth inputProps={{ step: 0.5 }} />
            <TextField select label={t('dashboard.recordType')} value={timeForm.type} onChange={(e) => setTimeForm({ ...timeForm, type: e.target.value })} fullWidth>
              <MenuItem value="work">{t('dashboard.typeWork')}</MenuItem>
              <MenuItem value="vacation">{t('dashboard.typeVacation')}</MenuItem>
              <MenuItem value="day_off">{t('dashboard.typeDayOff')}</MenuItem>
              <MenuItem value="sick_leave">{t('dashboard.typeSickLeave')}</MenuItem>
            </TextField>
            <TextField label={t('dashboard.comment')} value={timeForm.comment} onChange={(e) => setTimeForm({ ...timeForm, comment: e.target.value })} fullWidth />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTimeModalOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleSaveTime} variant="contained" color="primary">{t('common.save')}</Button>
        </DialogActions>
      </Dialog>

      {/* Payment Modal */}
      <Dialog open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} PaperProps={{ className: 'nursia-modal-content' }} maxWidth="sm" fullWidth>
        <DialogTitle>💰 {t('dashboard.payoutAdvanceTitle')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField select label={t('dashboard.worker')} value={paymentForm.worker_id} onChange={(e) => setPaymentForm({ ...paymentForm, worker_id: e.target.value })} fullWidth>
              {workers?.map(w => (<MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>))}
            </TextField>
            <TextField select label={t('dashboard.payoutType')} value={paymentForm.category} onChange={(e) => setPaymentForm({ ...paymentForm, category: e.target.value })} fullWidth>
              <MenuItem value="salary">{t('dashboard.salary')}</MenuItem>
              <MenuItem value="bonus">{t('dashboard.bonusSingle')}</MenuItem>
              <MenuItem value="debt">{t('dashboard.advanceSingle')}</MenuItem>
              <MenuItem value="expense">{t('dashboard.expenseCompensation')}</MenuItem>
            </TextField>
            <TextField type="date" label={t('dashboard.date')} value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} fullWidth InputLabelProps={{ shrink: true }} />
            <TextField type="number" label={t('dashboard.amountLabel')} value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} fullWidth inputProps={{ step: 0.01 }} />
            <TextField label={t('dashboard.comment')} value={paymentForm.comment} onChange={(e) => setPaymentForm({ ...paymentForm, comment: e.target.value })} fullWidth />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentModalOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleSavePayment} variant="contained" color="primary">{t('common.save')}</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

export default DashboardPage;
