import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Box, TextField, MenuItem,
  TableSortLabel, Dialog, DialogTitle, DialogContent, DialogActions,
  DialogContentText, TablePagination, Chip, TableFooter, Popover, Tooltip
} from '@mui/material';
import { Add, Edit, Delete, Payment, Replay, Search, DateRange } from '@mui/icons-material';
import { DateRangePicker } from 'react-date-range';
import { ru } from 'date-fns/locale';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, addDays, addMonths } from 'date-fns';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { payments } from '../services/api';
import PaymentForm from '../components/PaymentForm';
import ContributorForm from '../components/ContributorForm';

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

function PaymentsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [paymentList, setPaymentList] = useState([]);
  const [filteredList, setFilteredList] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [showContributorForm, setShowContributorForm] = useState(false);
  const [editingContributor, setEditingContributor] = useState(null);
  const [sortField, setSortField] = useState('tracking_nr');
  const [sortDirection, setSortDirection] = useState('desc');
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    paymentStatus: 'all'
  });
  const [dateRange, setDateRange] = useState([{
    startDate: startOfMonth(new Date()),
    endDate: endOfMonth(new Date()),
    key: 'selection'
  }]);
  const [dateRangeAnchor, setDateRangeAnchor] = useState(null);
  const [categories, setCategories] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, paymentId: null, paymentName: '' });
  const [repeatTemplate, setRepeatTemplate] = useState(null);
  const [totals, setTotals] = useState({});
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Handle URL search parameter
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const searchParam = params.get('search');
    if (searchParam) {
      setFilters(prev => ({ ...prev, search: searchParam }));
      // Clear date range to show all results
      setDateRange([{ startDate: null, endDate: null, key: 'selection' }]);
      // Clear URL parameter
      navigate('/payments', { replace: true });
    }
  }, [location.search]);

  useEffect(() => {
    loadPayments();
  }, []);

  useEffect(() => {
    applyFiltersAndSort();
  }, [paymentList, filters, dateRange, sortField, sortDirection]);

  const loadPayments = async () => {
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
      setIsAdmin(userRes.data.role === 'admin');
    } catch (error) {
      console.error('Failed to load payments:', error);
    }
  };

  const applyFiltersAndSort = () => {
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
          payment.recipient?.name,
          payment.payer?.name,
          payment.description,
          new Date(payment.payment_date).toLocaleDateString(),
          payment.is_paid ? 'оплачено' : 'к оплате'
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
          return payment.is_paid === true;
        } else if (filters.paymentStatus === 'unpaid') {
          return payment.is_paid === false || payment.is_paid === undefined;
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
          aVal = a.recipient?.name || '';
          bVal = b.recipient?.name || '';
          break;
        case 'payer':
          aVal = a.payer?.name || '';
          bVal = b.payer?.name || '';
          break;
        case 'is_paid':
          aVal = a.is_paid ? 1 : 0;
          bVal = b.is_paid ? 1 : 0;
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

      if (payment.is_paid) {
        paidTotals[currency] += amount;
      } else {
        unpaidTotals[currency] += amount;
      }
    });

    setTotals({ all: newTotals, paid: paidTotals, unpaid: unpaidTotals });
  };

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
      recipient_id: payment.recipient_id,
      payer_id: payment.payer_id || '',
      payment_date: today,
      description: payment.description || '',
      is_paid: false
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

  const handlePaymentToggle = async (paymentId, isPaid) => {
    try {
      const payment = paymentList.find(e => e.id === paymentId);
      await payments.update(paymentId, {
        ...payment,
        is_paid: isPaid
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
  };

  const handleContributorClick = (contributor) => {
    if (contributor && isAdmin) {
      setEditingContributor(contributor);
      setShowContributorForm(true);
    }
  };

  const handleContributorFormSuccess = () => {
    loadPayments(); // Перезагружаем платежи, чтобы обновить имена участников
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Платежи</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => { setRepeatTemplate(null); setEditingPayment(null); setShowForm(true); }}
        >
          Добавить платёж
        </Button>
      </Box>

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

      <TableContainer component={Paper} sx={{ maxHeight: '70vh' }}>
        <Table size="small" stickyHeader sx={{ tableLayout: 'fixed' }}>
          <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
            <TableRow>
              <TableCell sx={{ width: 55, minWidth: 55, px: 0.5 }}>
                <TableSortLabel
                  active={sortField === 'tracking_nr'}
                  direction={sortField === 'tracking_nr' ? sortDirection : 'asc'}
                  onClick={() => handleSort('tracking_nr')}
                >
                  Номер
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'payment_date'}
                  direction={sortField === 'payment_date' ? sortDirection : 'asc'}
                  onClick={() => handleSort('payment_date')}
                >
                  Когда
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'payer'}
                  direction={sortField === 'payer' ? sortDirection : 'asc'}
                  onClick={() => handleSort('payer')}
                >
                  Плательщик
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'recipient'}
                  direction={sortField === 'recipient' ? sortDirection : 'asc'}
                  onClick={() => handleSort('recipient')}
                >
                  Получатель
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'amount'}
                  direction={sortField === 'amount' ? sortDirection : 'asc'}
                  onClick={() => handleSort('amount')}
                >
                  Сумма
                </TableSortLabel>
              </TableCell>

              <TableCell>
                <TableSortLabel
                  active={sortField === 'category'}
                  direction={sortField === 'category' ? sortDirection : 'asc'}
                  onClick={() => handleSort('category')}
                >
                  Категория
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ width: 250 }}>Комментарий</TableCell>
              <TableCell align="center">Смена</TableCell>
              {isAdmin && (
                <TableCell sx={{ width: 130 }}>
                  <TableSortLabel
                    active={sortField === 'is_paid'}
                    direction={sortField === 'is_paid' ? sortDirection : 'asc'}
                    onClick={() => handleSort('is_paid')}
                  >
                    Оплачено
                  </TableSortLabel>
                </TableCell>
              )}
              <TableCell sx={{ width: 130, minWidth: 130 }}>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>

            {filteredList.length === 0 && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 11 : 9} align="center">
                  Нет данных для отображения
                </TableCell>
              </TableRow>
            )}
            {filteredList
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((payment, index) => (
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
                      cursor: payment.payer?.name && isAdmin ? 'pointer' : 'default'
                    }}
                    onClick={() => isAdmin && handleContributorClick(payment.payer)}
                  >
                    <span
                      style={{
                        textDecoration: payment.payer?.name && isAdmin ? 'underline' : 'none',
                        textDecorationStyle: 'dotted',
                        textDecorationColor: 'rgba(25, 118, 210, 0.5)'
                      }}
                    >
                      {payment.payer?.name || '-'}
                    </span>
                  </TableCell>
                  <TableCell
                    sx={{
                      cursor: payment.recipient?.name && isAdmin ? 'pointer' : 'default'
                    }}
                    onClick={() => handleContributorClick(payment.recipient)}
                  >
                    <span
                      style={{
                        textDecoration: payment.recipient?.name && isAdmin ? 'underline' : 'none',
                        textDecorationStyle: 'dotted',
                        textDecorationColor: 'rgba(25, 118, 210, 0.5)'
                      }}
                    >
                      {payment.recipient?.name || '-'}
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
                    <TableCell sx={{ maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{payment.description || '-'}</TableCell>
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
                  {isAdmin && (
                    <TableCell>
                      <Chip
                        label={payment.is_paid ? 'Оплачено' : 'К оплате'}
                        color={payment.is_paid ? 'success' : 'warning'}
                        size="small"
                        clickable
                        onClick={() => handlePaymentToggle(payment.id, !payment.is_paid)}
                        icon={<Payment />}
                        sx={{
                          cursor: 'pointer',
                          '&:hover': {
                            backgroundColor: payment.is_paid ? '#2e7d32' : '#ed6c02',
                            color: 'white'
                          }
                        }}
                      />
                    </TableCell>
                  )}
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

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mt: 1 }}>
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="body2" component="span" sx={{ fontWeight: 'bold' }}>
              Итого:
            </Typography>
            <Typography variant="body2" component="span" sx={{ ml: 1 }}>
              {Object.entries(totals.all || {}).map(([currency, amount]) =>
                `${amount.toFixed(2)} ${currencies.find(c => c.code === currency)?.symbol || currency}`
              ).join(', ') || '0.00'}
            </Typography>
          </Box>

          {isAdmin && (
            <>
              <Box>
                <Typography variant="body2" component="span" sx={{ fontWeight: 'bold', color: '#2e7d32' }}>
                  Оплачено:
                </Typography>
                <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                  {Object.entries(totals.paid || {}).map(([currency, amount]) =>
                    `${amount.toFixed(2)} ${currencies.find(c => c.code === currency)?.symbol || currency}`
                  ).join(', ') || '0.00'}
                </Typography>
              </Box>

              <Box>
                <Typography variant="body2" component="span" sx={{ fontWeight: 'bold', color: '#d32f2f' }}>
                  Не оплачено:
                </Typography>
                <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                  {Object.entries(totals.unpaid || {}).map(([currency, amount]) =>
                    `${amount.toFixed(2)} ${currencies.find(c => c.code === currency)?.symbol || currency}`
                  ).join(', ') || '0.00'}
                </Typography>
              </Box>
            </>
          )}
        </Box>

        <TablePagination
          component="div"
          count={filteredList.length}
          page={page}
          onPageChange={(event, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(parseInt(event.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50, 100]}
          labelRowsPerPage="Строк на странице:"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} из ${count}`}
          sx={{ border: 'none' }}
        />
      </Box>

      <PaymentForm
        open={showForm}
        payment={editingPayment}
        initialData={repeatTemplate}
        onClose={() => { setRepeatTemplate(null); handleFormClose(); }}
      />

      <ContributorForm
        open={showContributorForm}
        contributor={editingContributor}
        onClose={() => {
          setShowContributorForm(false);
          setEditingContributor(null);
        }}
        onSuccess={handleContributorFormSuccess}
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