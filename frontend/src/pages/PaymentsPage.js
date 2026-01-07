import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useWebSocket } from '../contexts/WebSocketContext';
import {
  Typography, Button, TableCell,
  Paper, IconButton, Box, TextField, MenuItem,
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
import VirtualizedPaymentsTable from '../components/VirtualizedPaymentsTable';


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

const formatDateFull = (dateInput) => {
  if (!dateInput) return '—';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '—';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

const formatTimeFull = (dateInput) => {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
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


  // Loading state
  const [loading, setLoading] = useState(true);

  // Column Resizing Logic (same as TimeTrackerPage)
  const [columnWidths, setColumnWidths] = useState(() => {
    try {
      const saved = localStorage.getItem('payments_columnWidths');
      if (saved) return JSON.parse(saved);
    } catch (e) { }
    return {
      tracking_nr: 50,
      payment_date: 120,
      payer: 100,
      recipient: 90,
      amount: 90,
      category: 90,
      description: 150,
      assignment: 80,
      status: 100,
      actions: 100
    };
  });

  const [resizing, setResizing] = useState(null);

  const startResizing = (column, e) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({
      column,
      startX: e.pageX,
      startWidth: columnWidths[column]
    });
  };

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e) => {
      const delta = e.pageX - resizing.startX;
      const newWidth = Math.max(40, resizing.startWidth + delta);
      setColumnWidths(prev => {
        const updated = { ...prev, [resizing.column]: newWidth };
        localStorage.setItem('payments_columnWidths', JSON.stringify(updated));
        return updated;
      });
    };

    const handleMouseUp = () => setResizing(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing]);


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

  const loadPayments = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [paymentsRes, categoriesRes, userRes] = await Promise.all([
        payments.list({ limit: 100000 }), // Load all payments for virtualization
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
    } finally {
      if (!silent) setLoading(false);
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
          payment.recipient?.full_name,
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
          aVal = a.payer?.name || a.payer?.full_name || '';
          bVal = b.payer?.name || b.payer?.full_name || '';
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
      loadPayments(true); // Silent refresh
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
      if (!payment) return;

      // Send only required fields, not the entire object with nested relations
      const updateData = {
        amount: parseFloat(payment.amount),
        currency: payment.currency,
        category_id: payment.category_id,
        recipient_id: payment.recipient_id,
        payer_id: payment.payer_id,
        payment_date: payment.payment_date,
        description: payment.description || '',
        payment_status: newStatus
      };

      // Only include assignment_id if it exists (backend preserves old value if not sent)
      if (payment.assignment_id) {
        updateData.assignment_id = payment.assignment_id;
      }

      await payments.update(paymentId, updateData);
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
              ? `${formatDateFull(dateRange[0].startDate)} — ${formatDateFull(dateRange[0].endDate)}`
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

      <VirtualizedPaymentsTable
        payments={filteredList}
        canManagePaymentStatus={canManagePaymentStatus}
        currencies={currencies}
        isAdmin={isAdmin}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        onEdit={handleEdit}
        onDelete={handleDeleteClick}
        onRepeat={handleRepeat}
        onToggleStatus={handlePaymentToggle}
        columnWidths={columnWidths}
        renderHeaderCell={(id, label, align, sortKey, extraSx = {}) => {
          const isResizingThis = resizing?.column === id;

          return (
            <TableCell
              align={align || 'left'}
              sx={{
                width: columnWidths[id],
                minWidth: columnWidths[id],
                position: 'relative',
                borderBottom: '1px solid rgba(224, 224, 224, 1)',
                backgroundColor: '#f5f5f5',
                ...extraSx,
                '&:hover .resizer': { opacity: 1 }
              }}
            >
              {sortKey ? (
                <TableSortLabel
                  active={sortField === sortKey}
                  direction={sortField === sortKey ? sortDirection : 'asc'}
                  onClick={() => handleSort(sortKey)}
                >
                  <strong>{label}</strong>
                </TableSortLabel>
              ) : (
                <strong>{label}</strong>
              )}
              <Box
                className="resizer"
                onMouseDown={(e) => startResizing(id, e)}
                sx={{
                  position: 'absolute',
                  right: 0,
                  top: '15%',
                  height: '70%',
                  width: '3px',
                  cursor: 'col-resize',
                  backgroundColor: isResizingThis ? '#1976d2' : 'divider',
                  opacity: isResizingThis ? 1 : 0,
                  borderRadius: '2px',
                  transition: 'opacity 0.2s, background-color 0.2s',
                  zIndex: 10,
                  '&:hover': {
                    opacity: 1,
                    backgroundColor: '#1976d2',
                    width: '5px'
                  }
                }}
              />
            </TableCell>
          );
        }}
      />

      {/* Total records count */}
      {filteredList.length > 0 && (
        <Box sx={{ textAlign: 'center', py: 2, color: 'text.secondary' }}>
          <Typography variant="body2">
            Всего записей: {filteredList.length}
          </Typography>
        </Box>
      )}

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