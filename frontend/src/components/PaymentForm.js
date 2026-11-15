import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, MenuItem, Box, Chip, Select, InputLabel, FormControl, Alert
} from '@mui/material';
import { payments, currencies, users } from '../services/api';

const WORKER_ALLOWED_GROUPS = ['expense', 'repayment', 'other'];

function PaymentForm({ open, payment, initialData, onClose }) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    amount: '',
    currency: '',
    category_id: '',
    recipient_id: '',
    payer_id: '',
    payment_date: new Date().toISOString().split('T').at(0),
    description: '',
    payment_status: 'unpaid'
  });
  const [originalTime, setOriginalTime] = useState(null);
  const [categories, setCategories] = useState([]);
  const [currencyList, setCurrencyList] = useState([]);
  const [userList, setUserList] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEmployer, setIsEmployer] = useState(false);

  const prevOpenRef = React.useRef(false);

  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;

    if (justOpened) {
      loadData();

      if (payment) {
        const dateTimeParts = payment.payment_date.split('T');
        setOriginalTime(dateTimeParts.at(1) || null);

        setFormData({
          amount: payment.amount,
          currency: payment.currency,
          category_id: payment.category_id,
          recipient_id: payment.recipient_id || '',
          payer_id: payment.payer_id || '',
          payment_date: dateTimeParts.at(0),
          description: payment.description || '',
          payment_status: payment.payment_status || 'unpaid',
          assignment_id: payment.assignment_id || ''
        });
      } else if (initialData) {
        setFormData({
          amount: initialData.amount || '',
          currency: initialData.currency || '',
          category_id: initialData.category_id || '',
          recipient_id: initialData.recipient_id || '',
          payer_id: initialData.payer_id || '',
          payment_date: initialData.payment_date || new Date().toISOString().split('T').at(0),
          description: initialData.description || '',
          payment_status: initialData.payment_status || 'unpaid',
          assignment_id: initialData.assignment_id || ''
        });
      } else {
        setFormData({
          amount: '',
          currency: '',
          category_id: '',
          recipient_id: '',
          payer_id: '',
          payment_date: new Date().toISOString().split('T').at(0),
          description: '',
          payment_status: 'unpaid',
          assignment_id: ''
        });
      }
      setLocalError('');
    }
  }, [open, payment, initialData]);

  const loadData = async () => {
    try {
      const [categoriesRes, currenciesRes, userRes, usersRes] = await Promise.all([
        payments.categories(),
        currencies.list(),
        payments.getUserInfo(),
        users.listAll().then(r => r.data)
      ]);

      const allCats = categoriesRes.data;
      setCurrencyList(currenciesRes.data.currencies);

      const userData = userRes.data;
      setCurrentUser(userData);
      const userId = userData.id;

      const filteredUsers = (Array.isArray(usersRes) ? usersRes : []).filter(u => {
        const uId = u.id || u.user_id;
        return String(uId) !== String(userId);
      });
      setUserList(filteredUsers);

      const roles = userData.roles || [];
      const admin = roles.includes('admin');
      const employer = roles.includes('employer');
      const worker = roles.includes('worker');

      setIsAdmin(admin);
      setIsEmployer(employer);

      if (admin || employer) {
        setCategories(allCats);
      } else if (worker) {
        const filteredCats = allCats.filter(cat =>
          cat.category_group && WORKER_ALLOWED_GROUPS.includes(cat.category_group.code)
        );
        setCategories(filteredCats);
      } else {
        setCategories([]);
      }

      const defaultCurrency = currenciesRes.data.details.find(c => c.is_default);
      if (defaultCurrency && !payment && !initialData) {
        setFormData(prev => ({ ...prev, currency: defaultCurrency.code }));
      }

      if (!payment && !initialData && userData.id) {
        setFormData(prev => ({ ...prev, payer_id: userData.id }));
      }
    } catch (error) {
      console.error('Failed to load form data:', error);
      setLocalError(t('payments.formLoadError'));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const timeToUse = payment && originalTime ? originalTime : '00:00:00';

    const submitData = {
      ...formData,
      amount: parseFloat(formData.amount),
      category_id: formData.category_id ? parseInt(formData.category_id) : undefined,
      recipient_id: formData.recipient_id ? parseInt(formData.recipient_id) : undefined,
      payer_id: formData.payer_id ? parseInt(formData.payer_id) : (currentUser?.id || undefined),
      assignment_id: formData.assignment_id ? parseInt(formData.assignment_id) : undefined,
      payment_date: formData.payment_date + 'T' + timeToUse
    };

    setLoading(true);
    setLocalError('');
    try {
      if (payment) {
        await payments.update(payment.id, submitData);
      } else {
        await payments.create(submitData);
      }
      onClose();
    } catch (error) {
      console.error('Failed to save payment:', error);
      setLocalError(error.response?.data?.detail || t('payments.formSaveError'));
    } finally {
      setLoading(false);
    }
  };

  const showRecipientField = isAdmin || isEmployer;

    return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {payment
          ? t('payments.editPaymentTitle', { number: payment.tracking_nr || '' })
          : t('payments.newPaymentTitle')}
      </DialogTitle>
      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
        <DialogContent>
          {localError && <Alert severity="error" sx={{ mb: 2 }}>{localError}</Alert>}
          <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
            <TextField
              label={t('payments.colAmount')}
              type="number"
              margin="normal"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              required
              sx={{ flex: 1, minWidth: 160 }}
            />
            <TextField
              select
              label={t('payments.currency')}
              margin="normal"
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              sx={{ width: 140 }}
            >
              {currencyList.map((curr) => (
                <MenuItem key={curr.code || curr} value={curr.code || curr}>
                  {curr.symbol ? `${curr.symbol} ${curr.code}` : curr}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {showRecipientField && (
            <TextField
              select
              label={t('payments.recipient')}
              margin="normal"
              fullWidth
              value={formData.recipient_id}
              onChange={(e) => setFormData({ ...formData, recipient_id: e.target.value })}
              required
            >
              <MenuItem value="">—</MenuItem>
              {userList.map((user) => (
                <MenuItem key={user.id} value={user.id}>
                  {user.full_name || user.username}
                </MenuItem>
              ))}
            </TextField>
          )}

          <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
            <TextField
              select
              label={t('payments.category')}
              margin="normal"
              value={formData.category_id}
              onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
              sx={{ flex: 1, minWidth: 160 }}
              required
            >
              <MenuItem value="">—</MenuItem>
              {categories.map((cat) => (
                <MenuItem key={cat.id} value={cat.id}>
                  {['Аванс', 'Долг'].includes(cat.name)
                    ? (
                      <Chip
                        label={cat.name}
                        size="small"
                        sx={{ backgroundColor: '#FFEB3B', color: '#000' }}
                      />
                    )
                    : cat.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label={t('payments.date')}
              type="date"
              margin="normal"
              value={formData.payment_date}
              onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 180 }}
            />
          </Box>

          <TextField
            fullWidth
            label={t('payments.description')}
            margin="normal"
            multiline
            rows={3}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            inputProps={{ maxLength: 1000 }}
            helperText={t('payments.charsCount', { current: formData.description.length, max: 1000 })}
          />

          {isAdmin && (
            <Box mt={2}>
              <FormControl sx={{ minWidth: 200 }}>
                <InputLabel>{t('payments.paymentStatusLabel')}</InputLabel>
                <Select
                  value={formData.payment_status}
                  onChange={(e) => setFormData({ ...formData, payment_status: e.target.value })}
                  label={t('payments.paymentStatusLabel')}
                >
                  <MenuItem value="unpaid">{t('payments.statusUnpaid')}</MenuItem>
                  <MenuItem value="paid">{t('payments.statusPaid')}</MenuItem>
                  <MenuItem value="offset">{t('payments.statusOffset')}</MenuItem>
                </Select>
              </FormControl>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export default PaymentForm;
