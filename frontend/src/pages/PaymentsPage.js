import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useWebSocket } from '../contexts/WebSocketContext';
import {
  Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Box, TextField, MenuItem,
  TableSortLabel, Dialog, DialogTitle, DialogContent, DialogActions,
  DialogContentText, Chip, Popover, Tooltip,
  Grid, Card, CardContent
} from '@mui/material';
import { Add, Edit, Delete, Payment, Replay, Search, DateRange } from '@mui/icons-material';
import { DateRangePicker } from 'react-date-range';
import { ru } from 'date-fns/locale';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, addDays, addMonths } from 'date-fns';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { payments } from '../services/api';
import PaymentForm from '../components/PaymentForm';

// Russian localized static ranges for DateRangePicker
const ruStaticRanges = [
  { label: 'Сегодня', range: () => ({ startDate: new Date(), endDate: new Date() }), isSelected: () => false },
  { label: 'Вчера', range: () => ({ startDate: addDays(new Date(), -1), endDate: addDays(new Date(), -1) }), isSelected: () => false },
  { label: 'Эта неделя', range: () => ({ startDate: startOfWeek(new Date(), { weekStartsOn: 1 }), endDate: endOfWeek(new Date(), { weekStartsOn: 1 }) }), isSelected: () => false },
  { label: 'Прошлая неделя', range: () => ({ startDate: startOfWeek(addDays(new Date(), -7), { weekStartsOn: 1 }), endDate: endOfWeek(addDays(new Date(), -7), { weekStartsOn: 1 }) }), isSelected: () => false },
  { label: 'Этот месяц', range: () => ({ startDate: startOfMonth(new Date()), endDate: endOfMonth(new Date()) }), isSelected: () => false },
  { label: 'Прошлый месяц', range: () => ({ startDate: startOfMonth(addMonths(new Date(), -1)), endDate: endOfMonth(addMonths(new Date(), -1)) }), isSelected: () => false },
  { label: 'Этот год', range: () => ({ startDate: startOfYear(new Date()), endDate: endOfYear(new Date()) }), isSelected: () => false }
];

// Helper to format Date to YYYY-MM-DD without timezone issues
const toLocalDateString = (date) => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const [year, month, day] = dateStr.split('-');
  return `${day}.${month}.${year}`;
};

// Helper to parse date from URL string
const parseDateFromUrl = (dateStr) => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Storage key for persisting filters
const FILTERS_STORAGE_KEY = 'payments_filters';

function PaymentsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [paymentList, setPaymentList] = useState([]);
  const [filteredList, setFilteredList] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [sortField, setSortField] = useState('tracking_nr');
  const [sortDirection, setSortDirection] = useState('desc');

  // Initialize filters from URL params or localStorage
  const [filters, setFilters] = useState(() => {
    // First try URL params
    const urlSearch = searchParams.get('search');
    const urlCategory = searchParams.get('category');
    const urlStatus = searchParams.get('status');

    if (urlSearch || urlCategory || urlStatus) {
      return {
        search: urlSearch || '',
        category: urlCategory || '',
        paymentStatus: urlStatus || 'all'
      };
    }

    // Fallback to localStorage
    try {
      const stored = localStorage.getItem(FILTERS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          search: parsed.search || '',
          category: parsed.category || '',
          paymentStatus: parsed.paymentStatus || 'all'
        };
      }
    } catch (e) { }

    return { search: '', category: '', paymentStatus: 'all' };
  });

  const [dateRange, setDateRange] = useState(() => {
    // First try URL params
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    if (fromParam || toParam) {
      return [{
        startDate: parseDateFromUrl(fromParam),
        endDate: parseDateFromUrl(toParam),
        key: 'selection'
      }];
    }

    // Fallback to localStorage
    try {
      const stored = localStorage.getItem(FILTERS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.from || parsed.to) {
          return [{
            startDate: parseDateFromUrl(parsed.from),
            endDate: parseDateFromUrl(parsed.to),
            key: 'selection'
          }];
        }
      }
    } catch (e) { }

    return [{
      startDate: null,
      endDate: null,
      key: 'selection'
    }];
  });
  const [dateRangeAnchor, setDateRangeAnchor] = useState(null);
  const [categories, setCategories] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canManagePaymentStatus, setCanManagePaymentStatus] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, paymentId: null, paymentName: '' });
  const [repeatTemplate, setRepeatTemplate] = useState(null);
  const [totals, setTotals] = useState({});

  // Sync filters to URL params AND localStorage
  useEffect(() => {
    const params = new URLSearchParams();
    const storageData = {};

    if (filters.search) {
      params.set('search', filters.search);
      storageData.search = filters.search;
    }
    if (filters.category) {
      params.set('category', filters.category);
      storageData.category = filters.category;
    }
    if (filters.paymentStatus && filters.paymentStatus !== 'all') {
      params.set('status', filters.paymentStatus);
      storageData.paymentStatus = filters.paymentStatus;
    }
    if (dateRange[0].startDate) {
      const fromStr = toLocalDateString(dateRange[0].startDate);
      params.set('from', fromStr);
      storageData.from = fromStr;
    }
    if (dateRange[0].endDate) {
      const toStr = toLocalDateString(dateRange[0].endDate);
      params.set('to', toStr);
      storageData.to = toStr;
    }

    setSearchParams(params, { replace: true });
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(storageData));
  }, [filters, dateRange, setSearchParams]);

  const { subscribe } = useWebSocket();

  const loadPayments = useCallback(async () => {
    try {
      const [paymentsRes, categoriesRes, userRes] = await Promise.all([
        payments.list(),
        payments.categories(),
        payments.getUserInfo()
      ]);

      const token = localStorage.getItem('token');
      const currenciesData = await fetch('/api/currencies/', {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json());

      // Сортируем по дате ASC и присваиваем номер строки (самый новый = наибольший номер)
      const sortedPayments = [...paymentsRes.data].sort((a, b) =>
        new Date(a.payment_date) - new Date(b.payment_date)
      );

      const paymentsWithRowNumbers = sortedPayments.map((payment, index) => ({
        ...payment,
        rowNumber: index + 1
      }));

      setPaymentList(paymentsWithRowNumbers);
      setCategories(categoriesRes.data);
      setCurrencies(currenciesData.details || []);
      setIsAdmin(userRes.data.roles?.includes('admin') || userRes.data.role === 'admin');

      // Check if user has manage_payment_status permission
      const hasPermission = userRes.data.permissions?.includes('manage_payment_status') ||
        userRes.data.roles?.includes('employer') ||
        userRes.data.role === 'employer';
      setCanManagePaymentStatus(hasPermission);
    } catch (error) {
      console.error('Failed to load payments:', error);
    }
  }, []);

  const applyFiltersAndSort = useCallback(() => {
    let filtered = [...paymentList];

    // Применяем фильтры
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(payment => {
        const searchFields = [
          payment.tracking_nr,
          payment.amount?.toString(),
          payment.currency,
          payment.category?.name,
          '-',
          payment.payer?.name || payment.payer?.full_name,
          payment.description,
          new Date(payment.payment_date).toLocaleDateString(),
          payment.payment_status === 'paid' ? 'оплачено' : 'к оплате'
        ];

        return searchFields.some(field =>
          field && field.toString().toLowerCase().includes(searchTerm)
        );
      });
    }

    if (filters.category) {
      filtered = filtered.filter(payment =>
        payment.category?.id === parseInt(filters.category)
      );

    }
    if (dateRange[0].startDate) {
      const startStr = toLocalDateString(dateRange[0].startDate);
      filtered = filtered.filter(payment =>
        toLocalDateString(new Date(payment.payment_date)) >= startStr
      );
    }
    if (dateRange[0].endDate) {
      const endStr = toLocalDateString(dateRange[0].endDate);
      filtered = filtered.filter(payment =>
        toLocalDateString(new Date(payment.payment_date)) <= endStr
      );
    }
    if (filters.paymentStatus !== 'all') {
      filtered = filtered.filter(payment => {
        if (filters.paymentStatus === 'paid') {
          return payment.payment_status === 'paid';
        } else if (filters.paymentStatus === 'unpaid') {
          return payment.payment_status === 'unpaid' || !payment.payment_status;
        }
        return true;
      });
    }

    // Применяем сортировку
    filtered.sort((a, b) => {
      let aVal, bVal;

      switch (sortField) {
        case 'tracking_nr':
          // Extract numeric ID from tracking_nr (P-21 -> 21)
          aVal = parseInt((a.tracking_nr || '').replace(/\D/g, '')) || 0;
          bVal = parseInt((b.tracking_nr || '').replace(/\D/g, '')) || 0;
          break;
        case 'id':
          aVal = a.id;
          bVal = b.id;
          break;
        case 'payment_date':
          aVal = new Date(a.payment_date);
          bVal = new Date(b.payment_date);
          break;
        case 'amount':
          aVal = parseFloat(a.amount);
          bVal = parseFloat(b.amount);
          break;
        case 'currency':
          aVal = a.currency;
          bVal = b.currency;
          break;
        case 'category':
          aVal = a.category?.name || '';
          bVal = b.category?.name || '';
          break;
        case 'recipient':
          aVal = a.recipient?.full_name || '';
          bVal = b.recipient?.full_name || '';
          break;
        case 'payer':
          aVal = a.payer?.name || '';
          bVal = b.payer?.name || '';
          break;
        case 'payment_status':
          const statusOrder = { 'paid': 1, 'unpaid': 0 };
          aVal = statusOrder[a.payment_status] || 0;
          bVal = statusOrder[b.payment_status] || 0;
          break;
        case 'description':
          aVal = a.description || '';
          bVal = b.description || '';
          break;
        case 'assignment_tracking_nr':
          aVal = a.assignment_tracking_nr || '';
          bVal = b.assignment_tracking_nr || '';
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });


    setFilteredList(filtered);

    // Вычисляем итоги по валютам
    const newTotals = {};
    const paidTotals = {};
    const unpaidTotals = {};

    filtered.forEach(payment => {
      const currency = payment.currency;
      const amount = parseFloat(payment.amount);

      if (!newTotals[currency]) {
        newTotals[currency] = 0;
        paidTotals[currency] = 0;
        unpaidTotals[currency] = 0;
      }

      newTotals[currency] += amount;

      if (payment.payment_status === 'paid') {
        paidTotals[currency] += amount;
      } else {
        unpaidTotals[currency] += amount;
      }
    });

    setTotals({ all: newTotals, paid: paidTotals, unpaid: unpaidTotals });
  }, [paymentList, filters, dateRange, sortField, sortDirection]);

  // Initialize data on mount
  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  // Subscribe to payment WebSocket events
  useEffect(() => {
    const unsubscribe = subscribe(['payment_created', 'payment_updated', 'payment_deleted'], () => {
      console.log('Payment changed, reloading...');
      loadPayments();
    });
    return unsubscribe;
  }, [subscribe, loadPayments]);

  // Apply filters when data or filters change
  useEffect(() => {
    applyFiltersAndSort();
  }, [applyFiltersAndSort]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters({ ...filters, [field]: value });
  };



  const handleDeleteClick = (payment) => {
    setDeleteDialog({
      open: true,
      paymentId: payment.id,
      paymentName: `${payment.amount} ${currencies.find(c => c.code === payment.currency)?.symbol || payment.currency} - ${payment.category?.name || 'Нет категории'}`
    });
  };

  const handleDeleteConfirm = async () => {
    try {
      await payments.delete(deleteDialog.paymentId);
      loadPayments();
      setDeleteDialog({ open: false, paymentId: null, paymentName: '' });
    } catch (error) {
      console.error('Failed to delete payment:', error);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialog({ open: false, paymentId: null, paymentName: '' });
  };

  const handleEdit = (payment) => {
    setRepeatTemplate(null);
    setEditingPayment(payment);
    setShowForm(true);
  };

  const handleRepeat = (payment) => {
    // Подготовить шаблон для повторного платежа: текущая дата и не оплачено
    const today = new Date().toISOString().split('T')[0];
    const template = {
      amount: payment.amount,
      currency: payment.currency,
      category_id: payment.category_id || '',
      payer_id: payment.payer_id || '',
      payment_date: today,
      description: payment.description || '',
      payment_status: 'unpaid'
    };

    setEditingPayment(null);
    setRepeatTemplate(template);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingPayment(null);
    loadPayments();
  };

  const handlePaymentToggle = async (paymentId, newStatus) => {
    try {
      const payment = paymentList.find(e => e.id === paymentId);
      await payments.update(paymentId, {
        ...payment,
        payment_status: newStatus
      });
      loadPayments();
    } catch (error) {
      console.error('Failed to update payment status:', error);
    }
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      category: '',
      paymentStatus: 'all'
    });
    setDateRange([{ startDate: null, endDate: null, key: 'selection' }]);
    // Clear URL params and localStorage
    setSearchParams({}, { replace: true });
    localStorage.removeItem(FILTERS_STORAGE_KEY);
  };


  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" sx={{ fontWeight: 600, color: '#1a237e' }}>Платежи</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => { setRepeatTemplate(null); setEditingPayment(null); setShowForm(true); }}
        >
          Добавить платёж
        </Button>
      </Box>

      {/* Summary Cards */}
      {(() => {
        const totalCount = filteredList.length;
        const paidPayments = filteredList.filter(p => p.payment_status === 'paid');
        const unpaidPayments = filteredList.filter(p => p.payment_status === 'unpaid' || !p.payment_status);
        const paidAmount = paidPayments.reduce((sum, p) => sum + Number(p.amount), 0);
        const unpaidAmount = unpaidPayments.reduce((sum, p) => sum + Number(p.amount), 0);
        const totalAmount = paidAmount + unpaidAmount;

        const formatAmount = (amount) => `₴${amount.toLocaleString('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

        return (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {/* Всего */}
            <Grid item xs={6} sm={3}>
              <Card sx={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                height: '100%'
              }}>
                <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="caption">Всего</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>{totalCount}</Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Оплачено */}
            <Grid item xs={6} sm={3}>
              <Card sx={{
                background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                color: 'white',
                height: '100%'
              }}>
                <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="caption">Оплачено ({paidPayments.length})</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>{formatAmount(paidAmount)}</Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* К оплате */}
            <Grid item xs={6} sm={3}>
              <Card sx={{
                background: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)',
                color: 'white',
                height: '100%'
              }}>
                <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="caption">К оплате ({unpaidPayments.length})</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>{formatAmount(unpaidAmount)}</Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Итого */}
            <Grid item xs={6} sm={3}>
              <Card sx={{
                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                color: 'white',
                height: '100%'
              }}>
                <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="caption">Итого</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>{formatAmount(totalAmount)}</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        );
      })()}

      <Paper sx={{ p: 2, mb: 2, backgroundColor: '#f5f5f5' }}>
        <Typography variant="h6" gutterBottom>Фильтры</Typography>
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
          <TextField
            label="Поиск"
            size="small"
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            placeholder="Поиск по платежам..."
            InputProps={{
              startAdornment: <Search sx={{ mr: 1, color: 'action.active' }} />
            }}
            sx={{ minWidth: 200 }}
          />
          <TextField
            select
            label="Категория"
            size="small"
            value={filters.category}
            onChange={(e) => handleFilterChange('category', e.target.value)}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">Все</MenuItem>
            {categories.map(cat => (
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
          {isAdmin && (
            <TextField
              select
              label="Оплата"
              size="small"
              value={filters.paymentStatus}
              onChange={(e) => handleFilterChange('paymentStatus', e.target.value)}
              sx={{ minWidth: 120 }}
            >
              <MenuItem value="all">Все</MenuItem>
              <MenuItem value="paid">Оплачено</MenuItem>
              <MenuItem value="unpaid">Не оплачено</MenuItem>
            </TextField>
          )}
          <Button
            variant="outlined"
            size="small"
            startIcon={<DateRange />}
            onClick={(e) => setDateRangeAnchor(e.currentTarget)}
            sx={{ minWidth: 200 }}
          >
            {dateRange[0].startDate && dateRange[0].endDate
              ? `${formatDate(toLocalDateString(dateRange[0].startDate))} — ${formatDate(toLocalDateString(dateRange[0].endDate))}`
              : 'Выберите период'}
          </Button>
          <Popover
            open={Boolean(dateRangeAnchor)}
            anchorEl={dateRangeAnchor}
            onClose={() => setDateRangeAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          >
            <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <DateRangePicker
                onChange={(item) => setDateRange([item.selection])}
                ranges={dateRange}
                locale={ru}
                months={1}
                direction="horizontal"
                rangeColors={['#1976d2']}
                staticRanges={ruStaticRanges}
                inputRanges={[]}
              />
              <Button
                onClick={() => setDateRangeAnchor(null)}
                sx={{ mr: 2, mb: 1 }}
                variant="contained"
                size="small"
              >
                ОК
              </Button>
            </Box>
          </Popover>
          <Button variant="outlined" onClick={clearFilters}>
            Очистить
          </Button>
        </Box>
      </Paper>

      <TableContainer component={Paper}>
        <Table size="small" sx={{ tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
              <TableCell sx={{ width: 55, minWidth: 55, px: 0.5 }}>
                <TableSortLabel
                  active={sortField === 'tracking_nr'}
                  direction={sortField === 'tracking_nr' ? sortDirection : 'asc'}
                  onClick={() => handleSort('tracking_nr')}
                >
                  <strong>Номер</strong>
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'payment_date'}
                  direction={sortField === 'payment_date' ? sortDirection : 'asc'}
                  onClick={() => handleSort('payment_date')}
                >
                  <strong>Когда</strong>
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ width: 120 }}>
                <TableSortLabel
                  active={sortField === 'payer'}
                  direction={sortField === 'payer' ? sortDirection : 'asc'}
                  onClick={() => handleSort('payer')}
                >
                  <strong>От кого</strong>
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ width: 100 }}>
                <TableSortLabel
                  active={sortField === 'recipient'}
                  direction={sortField === 'recipient' ? sortDirection : 'asc'}
                  onClick={() => handleSort('recipient')}
                >
                  <strong>Кому</strong>
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'amount'}
                  direction={sortField === 'amount' ? sortDirection : 'asc'}
                  onClick={() => handleSort('amount')}
                >
                  <strong>Сумма</strong>
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ width: 100 }}>
                <TableSortLabel
                  active={sortField === 'category'}
                  direction={sortField === 'category' ? sortDirection : 'asc'}
                  onClick={() => handleSort('category')}
                >
                  <strong>Категория</strong>
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'description'}
                  direction={sortField === 'description' ? sortDirection : 'asc'}
                  onClick={() => handleSort('description')}
                >
                  <strong>Комментарий</strong>
                </TableSortLabel>
              </TableCell>
              <TableCell align="center">
                <TableSortLabel
                  active={sortField === 'assignment_tracking_nr'}
                  direction={sortField === 'assignment_tracking_nr' ? sortDirection : 'asc'}
                  onClick={() => handleSort('assignment_tracking_nr')}
                >
                  <strong>Смена</strong>
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ width: 130 }}>
                <TableSortLabel
                  active={sortField === 'payment_status'}
                  direction={sortField === 'payment_status' ? sortDirection : 'asc'}
                  onClick={() => handleSort('payment_status')}
                >
                  <strong>Статус</strong>
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ width: 130, minWidth: 130 }}><strong>Действия</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>

            {filteredList.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} align="center">
                  Нет данных для отображения
                </TableCell>
              </TableRow>
            )}
            {filteredList.map((payment, index) => (
              <TableRow key={payment.id} sx={{ '& td': { verticalAlign: 'middle' } }}>
                <TableCell sx={{ width: 55, minWidth: 55, px: 0.5, fontSize: '0.75rem' }}>{payment.tracking_nr || '-'}</TableCell>
                <TableCell>
                  <div style={{ lineHeight: 1 }}>
                    <div>{new Date(payment.payment_date).toLocaleDateString()}</div>
                    <div style={{ fontSize: '0.85em', color: 'rgba(0,0,0,0.6)' }}>{new Date(payment.payment_date).toLocaleTimeString()}</div>
                  </div>
                </TableCell>
                <TableCell
                  sx={{
                    cursor: 'default'
                  }}
                >
                  <span
                    style={{
                      textDecoration: payment.payer?.name || payment.payer?.full_name && isAdmin ? 'underline' : 'none',
                      textDecorationStyle: 'dotted',
                      textDecorationColor: 'rgba(25, 118, 210, 0.5)'
                    }}
                  >
                    {payment.payer?.name || payment.payer?.full_name || '-'}
                  </span>
                </TableCell>
                <TableCell
                  sx={{
                    cursor: 'default'
                  }}
                >
                  <span
                    style={{
                      textDecoration: payment.recipient?.full_name && isAdmin ? 'underline' : 'none',
                      textDecorationStyle: 'dotted',
                      textDecorationColor: 'rgba(25, 118, 210, 0.5)'
                    }}
                  >
                    {payment.recipient?.full_name || '-'}
                  </span>
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{payment.amount} {currencies.find(c => c.code === payment.currency)?.symbol || payment.currency}</TableCell>
                <TableCell>
                  {['Аванс', 'Долг'].includes(payment.category?.name)
                    ? (
                      <Chip
                        label={payment.category.name}
                        size="small"
                        sx={{
                          backgroundColor: '#FFEB3B',
                          color: '#000',
                        }}
                      />
                    )
                    : (payment.category?.name || '-')}
                </TableCell>
                <Tooltip title={payment.description || ''} arrow placement="top">
                  <TableCell sx={{ width: 200, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{payment.description || '-'}</TableCell>
                </Tooltip>
                <TableCell align="center">
                  {payment.assignment_tracking_nr ? (
                    <Chip
                      label={payment.assignment_tracking_nr}
                      size="small"
                      color="primary"
                      clickable
                      onClick={() => navigate(`/time-tracker?search=${payment.assignment_tracking_nr}`)}
                      sx={{ cursor: 'pointer' }}
                    />
                  ) : (
                    <Typography variant="caption" color="text.secondary">—</Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Chip
                    label={payment.payment_status === 'paid' ? 'Оплачено' : 'К оплате'}
                    color={payment.payment_status === 'paid' ? 'success' : 'warning'}
                    size="small"
                    clickable={canManagePaymentStatus}
                    onClick={canManagePaymentStatus ? () => {
                      const nextStatus = payment.payment_status === 'unpaid' ? 'paid' : 'unpaid';
                      handlePaymentToggle(payment.id, nextStatus);
                    } : undefined}
                    icon={<Payment />}
                    sx={{
                      cursor: canManagePaymentStatus ? 'pointer' : 'default',
                      '&:hover': canManagePaymentStatus ? { opacity: 0.8 } : {}
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'nowrap' }}>
                    <IconButton title="Повторить платёж" onClick={() => handleRepeat(payment)} size="small">
                      <Replay fontSize="small" />
                    </IconButton>
                    <IconButton title="Редактировать" onClick={() => handleEdit(payment)} size="small">
                      <Edit fontSize="small" />
                    </IconButton>
                    <IconButton title="Удалить" onClick={() => handleDeleteClick(payment)} size="small">
                      <Delete fontSize="small" />
                    </IconButton>
                  </Box>
                </TableCell>
              </TableRow>
            )
            )}

          </TableBody>

        </Table>
      </TableContainer>




      <PaymentForm
        open={showForm}
        payment={editingPayment}
        initialData={repeatTemplate}
        onClose={() => { setRepeatTemplate(null); handleFormClose(); }}
      />

      <Dialog open={deleteDialog.open} onClose={handleDeleteCancel}>
        <DialogTitle>Подтвердите удаление</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Вы уверены, что хотите удалить платёж:
            <br />
            <strong>{deleteDialog.paymentName}</strong>
            <br /><br />
            Это действие нельзя отменить.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>Отмена</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Удалить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default PaymentsPage;