import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, MenuItem, Box, Chip, Switch, FormControlLabel
} from '@mui/material';
import { payments, contributors, currencies } from '../services/api';

function PaymentForm({ open, payment, initialData, onClose }) {
  const [formData, setFormData] = useState({
    amount: '',
    currency: '',
    category_id: '',
    recipient_id: '',
    payer_id: '',
    payment_date: new Date().toISOString().split('T')[0],
    description: '',
    is_paid: false
  });
  const [categories, setCategories] = useState([]);
  const [contributorList, setContributorList] = useState([]);
  const [currencyList, setCurrencyList] = useState([]);
  const [userList, setUserList] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (open) {
      loadData();
      if (payment) {
        setFormData({
          amount: payment.amount,
          currency: payment.currency,
          category_id: payment.category_id,
          recipient_id: payment.recipient_id,
          payer_id: payment.payer_id || '',
          payment_date: payment.payment_date.split('T')[0],
          description: payment.description || '',
          is_paid: payment.is_paid || false
        });
      } else if (initialData) {
        // Предзаполнение формы из шаблона (повторить платёж)
        setFormData({
          amount: initialData.amount || '',
          currency: initialData.currency || '',
          category_id: initialData.category_id || '',
          recipient_id: initialData.recipient_id || '',
          payer_id: initialData.payer_id || '',
          payment_date: initialData.payment_date || new Date().toISOString().split('T')[0],
          description: initialData.description || '',
          is_paid: initialData.is_paid || false
        });
      } else {
        // Сброс формы для нового платежа - валюта будет установлена в loadData
        setFormData({
          amount: '',
          currency: '',
          category_id: '',
          recipient_id: '',
          payer_id: '',
          payment_date: new Date().toISOString().split('T')[0],
          description: '',
          is_paid: false
        });
      }
    }
  }, [open, payment, initialData]);

  const loadData = async () => {
    try {
      const [categoriesRes, contributorsRes, currenciesRes, userRes, usersRes] = await Promise.all([
        payments.categories(),
        contributors.list(),
        currencies.list(),
        payments.getUserInfo(),
        fetch('/api/users/', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(r => r.json())
      ]);
      setCategories(categoriesRes.data);
      setContributorList(contributorsRes.data);
      setCurrencyList(currenciesRes.data.currencies);
      setUserList(usersRes || []);
      setIsAdmin(userRes.data.role === 'admin');

      // Устанавливаем валюту по умолчанию
      const defaultCurrency = currenciesRes.data.details.find(c => c.is_default);
      if (defaultCurrency && !payment && !initialData) {
        setFormData(prev => ({ ...prev, currency: defaultCurrency.code }));
      }
    } catch (error) {
      console.error('Failed to load form data:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const submitData = {
      ...formData,
      amount: parseFloat(formData.amount),
      category_id: formData.category_id ? parseInt(formData.category_id) : undefined,
      recipient_id: parseInt(formData.recipient_id),
      payer_id: formData.payer_id ? parseInt(formData.payer_id) : undefined,
      payment_date: formData.payment_date + 'T00:00:00'
    };

    try {
      if (payment) {
        await payments.update(payment.id, submitData);
      } else {
        await payments.create(submitData);
      }
      onClose();
    } catch (error) {
      console.error('Failed to save payment:', error);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{payment ? 'Редактировать платёж' : 'Новый платёж'}</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent>
          <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
            <TextField
              label="Сумма"
              type="number"
              margin="normal"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              required
              sx={{ flex: 1, minWidth: 160 }}
            />
            <TextField
              select
              label="Валюта"
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

          <Box display="flex" gap={2} flexWrap="wrap">
            <TextField
              select
              label="От кого"
              margin="normal"
              value={formData.payer_id}
              onChange={(e) => setFormData({ ...formData, payer_id: e.target.value })}
              required
              sx={{ flex: 1, minWidth: 160 }}
            >
              {contributorList.map((rec) => (
                <MenuItem key={rec.id} value={rec.id}>{rec.name}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Кому"
              margin="normal"
              value={formData.recipient_id}
              onChange={(e) => setFormData({ ...formData, recipient_id: e.target.value })}
              required
              sx={{ flex: 1, minWidth: 160 }}
            >
              {contributorList.map((rec) => (
                <MenuItem key={rec.id} value={rec.id}>{rec.name}</MenuItem>
              ))}
            </TextField>
          </Box>
          <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
            <TextField
              select
              label="Категория"
              margin="normal"
              value={formData.category_id}
              onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
              sx={{ flex: 1, minWidth: 160 }}
            >
              <MenuItem value="">—</MenuItem>
              {categories.map((cat) => (
                <MenuItem key={cat.id} value={cat.id}>
                  {['Аванс', 'Долг'].includes(cat.name)
                    ? (
                      <Chip
                        label={cat.name}
                        size="small"
                        sx={{
                          backgroundColor: '#FFEB3B',
                          color: '#000',
                        }}
                      />
                    )
                    : cat.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Дата"
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
            label="Описание"
            margin="normal"
            multiline
            rows={3}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            inputProps={{ maxLength: 1000 }}
            helperText={`${formData.description.length}/1000 символов`}
          />
          {isAdmin && (
            <Box mt={2}>
              <FormControlLabel
                control={
                  <Switch
                    checked={Boolean(formData.is_paid)}
                    onChange={(e) => setFormData({ ...formData, is_paid: e.target.checked })}
                    color="primary"
                  />
                }
                label={formData.is_paid ? 'Оплачено' : 'Не оплачено'}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Отмена</Button>
          <Button type="submit" variant="contained">Сохранить</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export default PaymentForm;