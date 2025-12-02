import React, { useState, useEffect } from 'react';
import { 
  Typography, Button, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Paper, IconButton, Box, TextField, MenuItem,
  TableSortLabel, Dialog, DialogTitle, DialogContent, DialogActions,
  DialogContentText, TablePagination, Chip
} from '@mui/material';
import { Add, Edit, Delete, Payment } from '@mui/icons-material';
import { payments } from '../services/api';
import PaymentForm from '../components/PaymentForm';

function PaymentsPage() {
  const [paymentList, setPaymentList] = useState([]);
  const [filteredList, setFilteredList] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [sortField, setSortField] = useState('number');
  const [sortDirection, setSortDirection] = useState('desc');
  const [filters, setFilters] = useState({
    category: '',
    currency: '',
    dateFrom: '',
    dateTo: '',
    paymentStatus: 'all'
  });
  const [categories, setCategories] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, paymentId: null, paymentName: '' });
  const [totals, setTotals] = useState({});
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  useEffect(() => {
    loadPayments();
  }, []);

  useEffect(() => {
    applyFiltersAndSort();
  }, [paymentList, filters, sortField, sortDirection]);

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
      
      setPaymentList(paymentsRes.data);
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
    if (filters.category) {
      filtered = filtered.filter(payment => 
        payment.category?.id === parseInt(filters.category)
      );

    }
    if (filters.currency) {
      filtered = filtered.filter(payment => payment.currency === filters.currency);

    }
    if (filters.dateFrom) {
      filtered = filtered.filter(payment => 
        new Date(payment.payment_date) >= new Date(filters.dateFrom)
      );

    }
    if (filters.dateTo) {
      filtered = filtered.filter(payment => 
        new Date(payment.payment_date) <= new Date(filters.dateTo + 'T23:59:59')
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
        case 'number':
          aVal = a.id;
          bVal = b.id;
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
          aVal = a.user?.full_name || '';
          bVal = b.user?.full_name || '';
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
    setFilters({...filters, [field]: value});
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
    setEditingPayment(payment);
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
      category: '',
      currency: '',
      dateFrom: '',
      dateTo: '',
      paymentStatus: 'all'
    });
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Платежи</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setShowForm(true)}
        >
          Добавить платёж
        </Button>
      </Box>

      <Paper sx={{ p: 2, mb: 2, backgroundColor: '#f5f5f5' }}>
        <Typography variant="h6" gutterBottom>Фильтры</Typography>
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
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
          <TextField
            select
            label="Валюта"
            size="small"
            value={filters.currency}
            onChange={(e) => handleFilterChange('currency', e.target.value)}
            sx={{ minWidth: 100 }}
          >
            <MenuItem value="">Все</MenuItem>
            {currencies.map(curr => (
              <MenuItem key={curr.code || curr} value={curr.code || curr}>
                {curr.symbol ? `${curr.symbol} ${curr.code}` : curr}
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
          <TextField
            label="Дата от"
            type="date"
            size="small"
            value={filters.dateFrom}
            onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Дата до"
            type="date"
            size="small"
            value={filters.dateTo}
            onChange={(e) => handleFilterChange('dateTo', e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button variant="outlined" onClick={clearFilters}>
            Очистить
          </Button>
        </Box>
      </Paper>

      <TableContainer component={Paper} sx={{ maxHeight: '70vh' }}>
        <Table size="small" stickyHeader>
          <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
            <TableRow>
              <TableCell sx={{ width: 60 }}>
                <TableSortLabel
                  active={sortField === 'number'}
                  direction={sortField === 'number' ? sortDirection : 'asc'}
                  onClick={() => handleSort('number')}
                >
                  №
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'payment_date'}
                  direction={sortField === 'payment_date' ? sortDirection : 'asc'}
                  onClick={() => handleSort('payment_date')}
                >
                  Дата
                </TableSortLabel>
              </TableCell>
              <TableCell>Время</TableCell>
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
              {isAdmin && (
                <TableCell>
                  <TableSortLabel
                    active={sortField === 'payer'}
                    direction={sortField === 'payer' ? sortDirection : 'asc'}
                    onClick={() => handleSort('payer')}
                  >
                    От кого
                  </TableSortLabel>
                </TableCell>
              )}
              <TableCell>
                <TableSortLabel
                  active={sortField === 'recipient'}
                  direction={sortField === 'recipient' ? sortDirection : 'asc'}
                  onClick={() => handleSort('recipient')}
                >
                  Кому
                </TableSortLabel>
              </TableCell>
              <TableCell>Комментарий</TableCell>
              {isAdmin && <TableCell>Оплачено</TableCell>}
              <TableCell sx={{ width: 120 }}>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>

            {filteredList.length === 0 && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 10 : 8} align="center">
                  Нет данных для отображения
                </TableCell>
              </TableRow>
            )}
            {filteredList
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((payment, index) => {
              const displayNumber = sortField === 'number' && sortDirection === 'desc' 
                ? filteredList.length - (page * rowsPerPage + index)
                : page * rowsPerPage + index + 1;
              
              return (
                <TableRow key={payment.id}>
                  <TableCell>{displayNumber}</TableCell>
                  <TableCell>{new Date(payment.payment_date).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(payment.payment_date).toLocaleTimeString()}</TableCell>
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
                  {isAdmin && (
                    <TableCell>{payment.user?.full_name || '-'}</TableCell>
                  )}
                  <TableCell>{payment.recipient?.name || '-'}</TableCell>
                  <TableCell>{payment.description || '-'}</TableCell>
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
                    <IconButton onClick={() => handleEdit(payment)}>
                      <Edit />
                    </IconButton>
                    <IconButton onClick={() => handleDeleteClick(payment)}>
                      <Delete />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}

          </TableBody>
          <TableBody>
            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
              <TableCell colSpan={3} sx={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>Итого:</TableCell>
              <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5', whiteSpace: 'nowrap' }}>
                {Object.entries(totals.all || {}).map(([currency, amount]) => 
                  `${amount.toFixed(2)} ${currencies.find(c => c.code === currency)?.symbol || currency}`
                ).join(' / ') || '0.00'}
              </TableCell>
              <TableCell colSpan={isAdmin ? 6 : 4} sx={{ backgroundColor: '#f5f5f5' }}></TableCell>
            </TableRow>
            {isAdmin && (
              <>
                <TableRow sx={{ backgroundColor: '#e8f5e8' }}>
                  <TableCell colSpan={3} sx={{ backgroundColor: '#e8f5e8', fontWeight: 'bold' }}>Оплачено:</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#e8f5e8', whiteSpace: 'nowrap' }}>
                    {Object.entries(totals.paid || {}).map(([currency, amount]) => 
                      `${amount.toFixed(2)} ${currencies.find(c => c.code === currency)?.symbol || currency}`
                    ).join(' / ') || '0.00'}
                  </TableCell>
                  <TableCell colSpan={6} sx={{ backgroundColor: '#e8f5e8' }}></TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: '#ffe8e8' }}>
                  <TableCell colSpan={3} sx={{ backgroundColor: '#ffe8e8', fontWeight: 'bold' }}>Не оплачено:</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#ffe8e8', whiteSpace: 'nowrap' }}>
                    {Object.entries(totals.unpaid || {}).map(([currency, amount]) => 
                      `${amount.toFixed(2)} ${currencies.find(c => c.code === currency)?.symbol || currency}`
                    ).join(' / ') || '0.00'}
                  </TableCell>
                  <TableCell colSpan={6} sx={{ backgroundColor: '#ffe8e8' }}></TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      
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
      />

      <PaymentForm
        open={showForm}
        payment={editingPayment}
        onClose={handleFormClose}
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