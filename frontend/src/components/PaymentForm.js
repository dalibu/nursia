import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, MenuItem, Box, Chip, Select, InputLabel, FormControl
} from '@mui/material';
import { payments, currencies, users } from '../services/api';

// Группы категорий доступные для worker
const WORKER_ALLOWED_GROUPS = ['expense', 'repayment', 'other'];

function PaymentForm({ open, payment, initialData, onClose }) {
  const [formData, setFormData] = useState({
    amount: '',
    currency: '',
    category_id: '',
    recipient_id: '',
    payer_id: '',  // Добавляем payer_id
    payment_date: new Date().toISOString().split('T')[0],
    description: '',
    payment_status: 'unpaid'
  });
  const [originalTime, setOriginalTime] = useState(null);
  const [allCategories, setAllCategories] = useState([]);
  const [categories, setCategories] = useState([]);  // Отфильтрованные по роли
  const [currencyList, setCurrencyList] = useState([]);
  const [userList, setUserList] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEmployer, setIsEmployer] = useState(false);
  const [isWorker, setIsWorker] = useState(false);

  // Track if we've already initialized the form for this dialog session
  const initializedRef = React.useRef(false);

  useEffect(() => {
    if (open) {
      loadData();

      // Only initialize formData when dialog first opens, not on subsequent payment updates
      if (!initializedRef.current) {
        initializedRef.current = true;

        if (payment) {
          const dateTimeParts = payment.payment_date.split('T');
          setOriginalTime(dateTimeParts[1] || null);

          setFormData({
            amount: payment.amount,
            currency: payment.currency,
            category_id: payment.category_id,
            recipient_id: payment.recipient_id || '',
            payer_id: payment.payer_id || '',
            payment_date: dateTimeParts[0],
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
            payment_date: initialData.payment_date || new Date().toISOString().split('T')[0],
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
            payment_date: new Date().toISOString().split('T')[0],
            description: '',
            payment_status: 'unpaid',
            assignment_id: ''
          });
        }
      }
      setLocalError(''); // Clear error on dialog open
    } else {
      // Reset the ref when dialog closes
      initializedRef.current = false;
    }
  }, [open, payment, initialData]);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');
      const [categoriesRes, currenciesRes, userRes, usersRes] = await Promise.all([
        payments.categories(),
        currencies.list(),
        payments.getUserInfo(),
        users.listAll().then(r => r.data)
      ]);

      const allCats = categoriesRes.data;
      setAllCategories(allCats);
      setCurrencyList(currenciesRes.data.currencies);
      // Получаем информацию о текущем пользователе
      const userData = userRes.data;
      setCurrentUser(userData);

      const userId = userData.id;

      // Сразу фильтруем список пользователей, чтобы не показывать себя
      const filteredUsers = (Array.isArray(usersRes) ? usersRes : []).filter(u => {
        const uId = u.id || u.user_id;
        return String(uId) !== String(userId);
      });

      setUserList(filteredUsers);

      // Check roles via roles array (RBAC)
      const roles = userData.roles || [];
      const admin = roles.includes('admin');
      const employer = roles.includes('employer');
      const worker = roles.includes('worker');

      setIsAdmin(admin);
      setIsEmployer(employer);
      setIsWorker(worker);

      // Фильтруем категории по роли
      if (admin || employer) {
        // Работодатель/Админ видит все категории
        setCategories(allCats);
      } else if (worker) {
        // Worker видит только expense, repayment, other
        const filteredCats = allCats.filter(cat =>
          cat.category_group && WORKER_ALLOWED_GROUPS.includes(cat.category_group.code)
        );
        setCategories(filteredCats);
      } else {
        setCategories([]);
      }

      // Set default currency
      const defaultCurrency = currenciesRes.data.details.find(c => c.is_default);
      if (defaultCurrency && !payment && !initialData) {
        setFormData(prev => ({ ...prev, currency: defaultCurrency.code }));
      }

      // Auto-set payer_id для нового платежа
      if (!payment && !initialData && userData.id) {
        // Для worker: payer = сам worker
        // Для employer/admin: payer = сам пользователь (работодатель)
        setFormData(prev => ({ ...prev, payer_id: userData.id }));
      }
    } catch (error) {
      console.error('Failed to load form data:', error);
      setLocalError('Не удалось загрузить данные для формы. Пожалуйста, попробуйте еще раз.');
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
      setLocalError(error.response?.data?.detail || 'Ошибка при сохранении платежа. Проверьте правильность заполнения всех полей.');
    } finally {
      setLoading(false);
    }
  };

  // Определяем нужно ли показывать поле Получатель
  const showRecipientField = isAdmin || isEmployer;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{payment ? `Редактировать платёж ${payment.tracking_nr || ''}` : 'Новый платёж'}</DialogTitle>
      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
        <DialogContent>
          {localError && <Alert severity="error" sx={{ mb: 2 }}>{localError}</Alert>}
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

          {/* Поле Получатель только для employer/admin */}
          {showRecipientField && (
            <TextField
              select
              label="Получатель"
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
              label="Категория"
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