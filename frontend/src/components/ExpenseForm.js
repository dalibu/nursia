import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, MenuItem, Box
} from '@mui/material';
import { expenses, recipients, currencies } from '../services/api';

function ExpenseForm({ open, expense, onClose }) {
  const [formData, setFormData] = useState({
    amount: '',
    currency: 'UAH',
    category_id: '',
    recipient_id: '',
    expense_date: new Date().toISOString().split('T')[0],
    description: ''
  });
  const [categories, setCategories] = useState([]);
  const [recipientList, setRecipientList] = useState([]);
  const [currencyList, setCurrencyList] = useState([]);

  useEffect(() => {
    if (open) {
      loadData();
      if (expense) {
        setFormData({
          amount: expense.amount,
          currency: expense.currency,
          category_id: expense.category_id,
          recipient_id: expense.recipient_id,
          expense_date: expense.expense_date.split('T')[0],
          description: expense.description || ''
        });
      } else {
        // Сброс формы для нового расхода
        setFormData({
          amount: '',
          currency: 'UAH',
          category_id: '',
          recipient_id: '',
          expense_date: new Date().toISOString().split('T')[0],
          description: ''
        });
      }
    }
  }, [open, expense]);

  const loadData = async () => {
    try {
      const [categoriesRes, recipientsRes, currenciesRes] = await Promise.all([
        expenses.categories(),
        recipients.list(),
        currencies.list()
      ]);
      setCategories(categoriesRes.data);
      setRecipientList(recipientsRes.data);
      setCurrencyList(currenciesRes.data.currencies);
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
      expense_date: formData.expense_date + 'T00:00:00'
    };
    
    try {
      if (expense) {
        await expenses.update(expense.id, submitData);
      } else {
        await expenses.create(submitData);
      }
      onClose();
    } catch (error) {
      console.error('Failed to save expense:', error);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{expense ? 'Редактировать расход' : 'Новый расход'}</DialogTitle>
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
              <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            select
            label="Получатель"
            margin="normal"
            value={formData.recipient_id}
            onChange={(e) => setFormData({...formData, recipient_id: e.target.value})}
            required
          >
            {recipientList.map((rec) => (
              <MenuItem key={rec.id} value={rec.id}>{rec.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            label="Дата"
            type="date"
            margin="normal"
            value={formData.expense_date}
            onChange={(e) => setFormData({...formData, expense_date: e.target.value})}
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
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Отмена</Button>
          <Button type="submit" variant="contained">Сохранить</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export default ExpenseForm;