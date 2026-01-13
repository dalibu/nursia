import React, { useState, useEffect } from 'react';
import {
  Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Box, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, DialogContentText, Switch,
  FormControlLabel, TablePagination
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import { currencies } from '../services/api';
import PageHeader from '../components/PageHeader';

function CurrenciesPage() {
  const [currencyList, setCurrencyList] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState(null);
  const [formData, setFormData] = useState({ code: '', name: '', symbol: '', is_active: true, is_default: false });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, currencyId: null, currencyName: '' });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  useEffect(() => {
    loadCurrencies();
  }, []);

  const loadCurrencies = async () => {
    try {
      const response = await currencies.getAll();
      setCurrencyList(response.data);
    } catch (error) {
      console.error('Failed to load currencies:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCurrency) {
        await currencies.update(editingCurrency.id, formData);
      } else {
        await currencies.create(formData);
      }
      handleFormClose();
      loadCurrencies();
    } catch (error) {
      console.error('Failed to save currency:', error);
    }
  };

  const handleEdit = (currency) => {
    setEditingCurrency(currency);
    setFormData({ 
      code: currency.code, 
      name: currency.name, 
      symbol: currency.symbol,
      is_active: currency.is_active,
      is_default: currency.is_default
    });
    setShowForm(true);
  };

  const handleDeleteClick = (currency) => {
    setDeleteDialog({
      open: true,
      currencyId: currency.id,
      currencyName: `${currency.code} (${currency.name})`
    });
  };

  const handleDeleteConfirm = async () => {
    try {
      await currencies.delete(deleteDialog.currencyId);
      loadCurrencies();
      setDeleteDialog({ open: false, currencyId: null, currencyName: '' });
    } catch (error) {
      console.error('Failed to delete currency:', error);
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingCurrency(null);
    setFormData({ code: '', name: '', symbol: '', is_active: true, is_default: false });
  };

  return (
    <Box>
      <PageHeader showMainMenu={true} />
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Валюты</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setShowForm(true)}
        >
          Добавить валюту
        </Button>
      </Box>

      <TableContainer component={Paper} sx={{ maxHeight: '70vh' }}>
        <Table size="small" stickyHeader>
          <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Код</TableCell>
              <TableCell>Название</TableCell>
              <TableCell>Символ</TableCell>
              <TableCell>Активна</TableCell>
              <TableCell>По умолчанию</TableCell>
              <TableCell>Дата создания</TableCell>
              <TableCell sx={{ width: 120 }}>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {currencyList
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((currency) => (
              <TableRow key={currency.id}>
                <TableCell>{currency.id}</TableCell>
                <TableCell>{currency.code}</TableCell>
                <TableCell>{currency.name}</TableCell>
                <TableCell>{currency.symbol}</TableCell>
                <TableCell>{currency.is_active ? 'Да' : 'Нет'}</TableCell>
                <TableCell>{currency.is_default ? 'Да' : 'Нет'}</TableCell>
                <TableCell>{new Date(currency.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <IconButton onClick={() => handleEdit(currency)}>
                    <Edit />
                  </IconButton>
                  <IconButton onClick={() => handleDeleteClick(currency)}>
                    <Delete />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      
      <TablePagination
        component="div"
        count={currencyList.length}
        page={page}
        onPageChange={(event, newPage) => setPage(newPage)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(event) => {
          setRowsPerPage(parseInt(event.target.value, 10));
          setPage(0);
        }}
        rowsPerPageOptions={[10, 25, 50]}
        labelRowsPerPage="Строк на странице:"
        labelDisplayedRows={({ from, to, count }) => `${from}-${to} из ${count}`}
      />

      <Dialog open={showForm} onClose={handleFormClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingCurrency ? 'Редактировать валюту' : 'Новая валюта'}
        </DialogTitle>
        <Box component="form" onSubmit={handleSubmit}>
          <DialogContent>
            <TextField
              fullWidth
              label="Код валюты"
              margin="normal"
              value={formData.code}
              onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
              required
              disabled={!!editingCurrency}
              inputProps={{ maxLength: 3 }}
            />
            <TextField
              fullWidth
              label="Название"
              margin="normal"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
            />
            <TextField
              fullWidth
              label="Символ"
              margin="normal"
              value={formData.symbol}
              onChange={(e) => setFormData({...formData, symbol: e.target.value})}
              required
              inputProps={{ maxLength: 10 }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={formData.is_active}
                  onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                />
              }
              label="Активна"
              sx={{ mt: 2 }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={formData.is_default}
                  onChange={(e) => setFormData({...formData, is_default: e.target.checked})}
                />
              }
              label="По умолчанию"
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleFormClose}>Отмена</Button>
            <Button type="submit" variant="contained">Сохранить</Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, currencyId: null, currencyName: '' })}>
        <DialogTitle>Подтвердите удаление</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Вы уверены, что хотите удалить валюту "{deleteDialog.currencyName}"?
            <br /><br />
            Это действие нельзя отменить.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, currencyId: null, currencyName: '' })}>
            Отмена
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Удалить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default CurrenciesPage;