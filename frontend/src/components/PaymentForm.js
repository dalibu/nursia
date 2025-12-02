import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, MenuItem, Box, Chip
} from '@mui/material';
import { payments, recipients, currencies } from '../services/api';

function PaymentForm({ open, payment, onClose }) {
  const [formData, setFormData] = useState({
    amount: '',
    currency: '',
    category_id: '',
    recipient_id: '',
    user_id: '',
    payment_date: new Date().toISOString().split('T')[0],
    description: '',
    is_paid: false
  });
  const [categories, setCategories] = useState([]);
  const [recipientList, setRecipientList] = useState([]);
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
          user_id: payment.user_id || '',
          payment_date: payment.payment_date.split('T')[0],
          description: payment.description || '',
          is_paid: payment.is_paid || false
        });
      } else {
        // Сброс формы для нового платежа - валюта будет установлена в loadData
        setFormData({
          amount: '',
          currency: '',
          category_id: '',
          recipient_id: '',
          user_id: '',
          payment_date: new Date().toISOString().split('T')[0],
          description: '',
          is_paid: false
        });
      }
    }
  }, [open, payment]);

  const loadData = async () => {
    try {
      const [categoriesRes, recipientsRes, currenciesRes, userRes, usersRes] = await Promise.all([
        payments.categories(),
        recipients.list(),
        currencies.list(),
        payments.getUserInfo(),
        fetch('/api/users/', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(r => r.json())
      ]);
      setCategories(categoriesRes.data);
      setRecipientList(recipientsRes.data);
      setCurrencyList(currenciesRes.data.currencies);
      setUserList(usersRes || []);
      setIsAdmin(userRes.data.role === 'admin');
      
      // Устанавливаем валюту по умолчанию
      const defaultCurrency = currenciesRes.data.details.find(c => c.is_default);
      if (defaultCurrency && !payment) {
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
      category_id: parseInt(formData.category_id),
      recipient_id: parseInt(formData.recipient_id),
      user_id: formData.user_id ? parseInt(formData.user_id) : undefined,
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
          <TextField
            fullWidth
            label="Сумма"
            type="number"
            margin="normal"
            value={formData.amount}
            onChange={(e) => setFormData({...formData, amount: e.target.value})}
            required
          />
          <TextField
            fullWidth
            select
            label="Валюта"
            margin="normal"
            value={formData.currency}
            onChange={(e) => setFormData({...formData, currency: e.target.value})}
          >
            {currencyList.map((curr) => (
              <MenuItem key={curr.code || curr} value={curr.code || curr}>
                {curr.symbol ? `${curr.symbol} ${curr.code}` : curr}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            select
            label="Категория"
            margin="normal"
            value={formData.category_id}
            onChange={(e) => setFormData({...formData, category_id: e.target.value})}
            required
          >
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
            fullWidth
            select
            label="Кому"
            margin="normal"
            value={formData.recipient_id}
            onChange={(e) => setFormData({...formData, recipient_id: e.target.value})}
            required
          >
            {recipientList.map((rec) => (
              <MenuItem key={rec.id} value={rec.id}>{rec.name}</MenuItem>
            ))}
          </TextField>
          {isAdmin && (
            <TextField
              fullWidth
              select
              label="От кого"
              margin="normal"
              value={formData.user_id}
              onChange={(e) => setFormData({...formData, user_id: e.target.value})}
            >
              <MenuItem value="">Текущий пользователь</MenuItem>
              {userList.map((user) => (
                <MenuItem key={user.id} value={user.id}>{user.full_name}</MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            fullWidth
            label="Дата"
            type="date"
            margin="normal"
            value={formData.payment_date}
            onChange={(e) => setFormData({...formData, payment_date: e.target.value})}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            fullWidth
            label="Описание"
            margin="normal"
            multiline
            rows={3}
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            inputProps={{ maxLength: 1000 }}
            helperText={`${formData.description.length}/1000 символов`}
          />
          {isAdmin && (
            <TextField
              fullWidth
              select
              label="Статус оплаты"
              margin="normal"
              value={formData.is_paid}
              onChange={(e) => setFormData({...formData, is_paid: e.target.value === 'true'})}
            >
              <MenuItem value={false}>Не оплачено</MenuItem>
              <MenuItem value={true}>Оплачено</MenuItem>
            </TextField>
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