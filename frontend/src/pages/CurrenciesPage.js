import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Box, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, DialogContentText, Switch,
  FormControlLabel, TablePagination
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import { currencies } from '../services/api';

function CurrenciesPage() {
  const { t, i18n } = useTranslation();
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

  const currentLocale = i18n.language === 'uk' ? 'uk-UA' : i18n.language || 'uk-UA';

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h6">{t('nav.currencies')}</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setShowForm(true)}>
          {t('currencies.addCurrency')}
        </Button>
      </Box>

      <TableContainer component={Paper} sx={{ maxHeight: '70vh' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>{t('currencies.code')}</TableCell>
              <TableCell>{t('categories.name')}</TableCell>
              <TableCell>{t('currencies.symbol')}</TableCell>
              <TableCell>{t('currencies.isActive')}</TableCell>
              <TableCell>{t('currencies.isDefault')}</TableCell>
              <TableCell>{t('currencies.createdAt')}</TableCell>
              <TableCell sx={{ width: 120 }}>{t('common.actions')}</TableCell>
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
                  <TableCell>{currency.is_active ? t('common.yes') : t('common.no')}</TableCell>
                  <TableCell>{currency.is_default ? t('common.yes') : t('common.no')}</TableCell>
                  <TableCell>{new Date(currency.created_at).toLocaleDateString(currentLocale)}</TableCell>
                  <TableCell>
                    <IconButton onClick={() => handleEdit(currency)}><Edit /></IconButton>
                    <IconButton onClick={() => handleDeleteClick(currency)}><Delete /></IconButton>
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
        rowsPerPageOptions={Array.of(10, 25, 50)}
      />

      <Dialog open={showForm} onClose={handleFormClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingCurrency ? t('currencies.editCurrency') : t('currencies.newCurrency')}
        </DialogTitle>
        <Box component="form" onSubmit={handleSubmit}>
          <DialogContent>
            <TextField
              fullWidth label={t('currencies.currencyCode')} margin="normal"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              required disabled={!!editingCurrency} inputProps={{ maxLength: 3 }}
            />
            <TextField
              fullWidth label={t('categories.name')} margin="normal"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <TextField
              fullWidth label={t('currencies.symbol')} margin="normal"
              value={formData.symbol}
              onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
              required inputProps={{ maxLength: 10 }}
            />
            <FormControlLabel
              control={<Switch checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />}
              label={t('currencies.isActive')}
              sx={{ mt: 2 }}
            />
            <FormControlLabel
              control={<Switch checked={formData.is_default} onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })} />}
              label={t('currencies.isDefault')}
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleFormClose}>{t('common.cancel')}</Button>
            <Button type="submit" variant="contained">{t('common.save')}</Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, currencyId: null, currencyName: '' })}>
        <DialogTitle>{t('payments.confirmDeleteTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('currencies.confirmDelete', { name: deleteDialog.currencyName })}
            <br /><br />
            {t('payments.irreversibleAction')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, currencyId: null, currencyName: '' })}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            {t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default CurrenciesPage;
