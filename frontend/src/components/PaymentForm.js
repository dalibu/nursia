import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, MenuItem, Box, Chip, Select, InputLabel, FormControl
} from '@mui/material';
import { payments, currencies } from '../services/api';

function PaymentForm({ open, payment, initialData, onClose }) {
  const [formData, setFormData] = useState({
    amount: '',
    currency: '',
    category_id: '',
    payer_id: '',
    payment_date: new Date().toISOString().split('T')[0],
    description: '',
    payment_status: 'unpaid'
  });
  const [originalTime, setOriginalTime] = useState(null);
  const [categories, setCategories] = useState([]);
  const [currencyList, setCurrencyList] = useState([]);
  const [userList, setUserList] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (open) {
      loadData();
      if (payment) {
        const dateTimeParts = payment.payment_date.split('T');
        setOriginalTime(dateTimeParts[1] || null);

        setFormData({
          amount: payment.amount,
          currency: payment.currency,
          category_id: payment.category_id,
          payer_id: payment.payer_id || '',
          payment_date: dateTimeParts[0],
          description: payment.description || '',
          payment_status: payment.payment_status || 'unpaid'
        });
      } else if (initialData) {
        setFormData({
          amount: initialData.amount || '',
          currency: initialData.currency || '',
          category_id: initialData.category_id || '',
          payer_id: initialData.payer_id || '',
          payment_date: initialData.payment_date || new Date().toISOString().split('T')[0],
          description: initialData.description || '',
          payment_status: initialData.payment_status || 'unpaid'
        });
      } else {
        setFormData({
          amount: '',
          currency: '',
          category_id: '',
          payer_id: '',
          payment_date: new Date().toISOString().split('T')[0],
          description: '',
          payment_status: 'unpaid'
        });
      }
    }
  }, [open, payment, initialData]);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');
      const [categoriesRes, currenciesRes, userRes, usersRes] = await Promise.all([
        payments.categories(),
        currencies.list(),
        payments.getUserInfo(),
        fetch('/api/users/', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
      ]);
      setCategories(categoriesRes.data);
      setCurrencyList(currenciesRes.data.currencies);
      setUserList(usersRes || []);
      // Check admin role via roles array (RBAC)
      const roles = userRes.data.roles || [];
      setIsAdmin(roles.includes('admin'));

      // Set default currency
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

    const timeToUse = payment && originalTime ? originalTime : '00:00:00';

    const submitData = {
      ...formData,
      amount: parseFloat(formData.amount),
      category_id: formData.category_id ? parseInt(formData.category_id) : undefined,
      payer_id: formData.payer_id ? parseInt(formData.payer_id) : undefined,
      payment_date: formData.payment_date + 'T' + timeToUse
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
      <DialogTitle>{payment ? `Редактировать платёж ${payment.tracking_nr || ''}` : 'Новый платёж'}</DialogTitle>
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

          <TextField
            select
            label="Плательщик"
            margin="normal"
            fullWidth
            value={formData.payer_id}
            onChange={(e) => setFormData({ ...formData, payer_id: e.target.value })}
            required
          >
            {userList.map((user) => (
              <MenuItem key={user.id} value={user.id}>{user.full_name || user.username}</MenuItem>
            ))}
          </TextField>

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
              <FormControl sx={{ minWidth: 200 }}>
                <InputLabel>Статус оплаты</InputLabel>
                <Select
                  value={formData.payment_status}
                  onChange={(e) => setFormData({ ...formData, payment_status: e.target.value })}
                  label="Статус оплаты"
                >
                  <MenuItem value="unpaid">Не оплачено</MenuItem>
                  <MenuItem value="paid">Оплачено</MenuItem>
                  <MenuItem value="offset">Зачтено</MenuItem>
                </Select>
              </FormControl>
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