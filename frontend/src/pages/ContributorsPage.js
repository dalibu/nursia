import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Box, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, DialogContentText, TablePagination,
  Chip, Switch, FormControlLabel, TableSortLabel, MenuItem, Alert
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import { contributors } from '../services/api';

function ContributorsPage() {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ name: '', type: '', description: '', is_active: true });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sortField, setSortField] = useState('id');
  const [sortDirection, setSortDirection] = useState('asc');
  const [filters, setFilters] = useState({ search: '', status: 'all' });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null, name: '' });
  const [message, setMessage] = useState(null); // { type: 'error' | 'success', text: string }

  useEffect(() => {
    loadContributors();
  }, []);

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && items.length > 0) {
      const itemToEdit = items.find(item => item.id.toString() === editId);
      if (itemToEdit) {
        setEditingItem(itemToEdit);
        setFormData({
          name: itemToEdit.name,
          type: itemToEdit.type,
          description: itemToEdit.description || '',
          is_active: itemToEdit.is_active !== false
        });
        setShowForm(true);
      }
    }
  }, [searchParams, items]);

  const loadContributors = async () => {
    try {
      const response = await contributors.listAdmin();
      setItems(response.data);
    } catch (error) {
      console.error('Failed to load contributors:', error);
      setMessage({ type: 'error', text: 'Не удалось загрузить список участников' });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await contributors.update(editingItem.id, formData);
      } else {
        await contributors.create(formData);
      }
      handleFormClose();
      loadContributors();
      setMessage({ type: 'success', text: 'Участник успешно сохранён' });
    } catch (error) {
      console.error('Failed to save contributor:', error);
      const msg = error.response?.data?.detail || 'Не удалось сохранить участника';
      setMessage({ type: 'error', text: msg });
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      type: item.type,
      description: item.description || '',
      is_active: item.is_active,
    });
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingItem(null);
    setFormData({ name: '', type: '', description: '', is_active: true });
  };

  const handleToggleActive = async (item) => {
    try {
      await contributors.update(item.id, {
        name: item.name,
        type: item.type,
        description: item.description,
        is_active: !item.is_active,
      });
      loadContributors();
    } catch (error) {
      console.error('Failed to toggle contributor:', error);
      const msg = error.response?.data?.detail || 'Не удалось изменить статус участника';
      setMessage({ type: 'error', text: msg });
    }
  };

  const handleDeleteClick = (item) => {
    // Сначала валидируем возможность удаления
    contributors.validateDelete(item.id)
      .then((response) => {
        const data = response.data;
        if (!data.can_delete) {
          const msg = data.reason || 'Нельзя удалить участника.';
          setMessage({ type: 'error', text: msg });
          return;
        }
        setDeleteDialog({ open: true, id: item.id, name: item.name });
      })
      .catch((error) => {
        const msg = error.response?.data?.detail || 'Ошибка проверки возможности удаления';
        setMessage({ type: 'error', text: msg });
      });
  };

  const handleDeleteConfirm = async () => {
    try {
      await contributors.delete(deleteDialog.id);
      setDeleteDialog({ open: false, id: null, name: '' });
      loadContributors();
      setMessage({ type: 'success', text: 'Участник удалён' });
    } catch (error) {
      const msg = error.response?.data?.detail || 'Не удалось удалить участника';
      setMessage({ type: 'error', text: msg });
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialog({ open: false, id: null, name: '' });
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
    setPage(0);
  };

  const clearFilters = () => {
    setFilters({ search: '', status: 'all' });
    setPage(0);
  };

  const getFilteredAndSortedItems = () => {
    let data = [...items];

    // Контекстный поиск по name, type, description
    if (filters.search) {
      const q = filters.search.toLowerCase();
      data = data.filter(item => (
        (item.name || '').toLowerCase().includes(q) ||
        (item.type || '').toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q)
      ));
    }

    // Фильтр по активности
    if (filters.status === 'active') {
      data = data.filter(item => item.is_active === true);
    } else if (filters.status === 'inactive') {
      data = data.filter(item => item.is_active === false);
    }

    // Сортировка
    data.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (sortField === 'created_at' || sortField === 'changed_at') {
        aVal = aVal ? new Date(aVal) : new Date(0);
        bVal = bVal ? new Date(bVal) : new Date(0);
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return data;
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Участники</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setShowForm(true)}
        >
          Добавить участника
        </Button>
      </Box>

      {message && (
        <Box mb={2}>
          <Alert
            severity={message.type}
            onClose={() => setMessage(null)}
          >
            {message.text}
          </Alert>
        </Box>
      )}

      <Box display="flex" gap={2} flexWrap="wrap" alignItems="center" mb={2}>
        <TextField
          label="Поиск"
          size="small"
          value={filters.search}
          onChange={(e) => handleFilterChange('search', e.target.value)}
          placeholder="Имя, тип, описание"
          sx={{ minWidth: 220 }}
        />
        <TextField
          select
          label="Активность"
          size="small"
          value={filters.status}
          onChange={(e) => handleFilterChange('status', e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="all">Все</MenuItem>
          <MenuItem value="active">Только активные</MenuItem>
          <MenuItem value="inactive">Только неактивные</MenuItem>
        </TextField>
        <Button variant="outlined" size="small" onClick={clearFilters}>
          Очистить
        </Button>
      </Box>

      <TableContainer component={Paper} sx={{ maxHeight: '70vh' }}>
        <Table size="small" stickyHeader>
          <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
            <TableRow>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'id'}
                  direction={sortField === 'id' ? sortDirection : 'asc'}
                  onClick={() => handleSort('id')}
                >
                  ID
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'name'}
                  direction={sortField === 'name' ? sortDirection : 'asc'}
                  onClick={() => handleSort('name')}
                >
                  Название
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'type'}
                  direction={sortField === 'type' ? sortDirection : 'asc'}
                  onClick={() => handleSort('type')}
                >
                  Тип
                </TableSortLabel>
              </TableCell>
              <TableCell>Описание</TableCell>
              <TableCell>Активен</TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'created_at'}
                  direction={sortField === 'created_at' ? sortDirection : 'asc'}
                  onClick={() => handleSort('created_at')}
                >
                  Создан
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'changed_at'}
                  direction={sortField === 'changed_at' ? sortDirection : 'asc'}
                  onClick={() => handleSort('changed_at')}
                >
                  Изменен
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ width: 120 }}>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {getFilteredAndSortedItems()
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.id}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.type}</TableCell>
                  <TableCell>{item.description || '-'}</TableCell>
                  <TableCell>
                    <Chip
                      label={item.is_active ? 'Активен' : 'Неактивен'}
                      color={item.is_active ? 'success' : 'default'}
                      size="small"
                      onClick={() => handleToggleActive(item)}
                      sx={{ cursor: 'pointer' }}
                    />
                  </TableCell>
                  <TableCell>{new Date(item.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{item.changed_at ? new Date(item.changed_at).toLocaleString() : '-'}</TableCell>
                  <TableCell>
                    <IconButton onClick={() => handleEdit(item)}>
                      <Edit />
                    </IconButton>
                    <IconButton onClick={() => handleDeleteClick(item)}>
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
        count={items.length}
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
          {editingItem ? 'Редактировать участника' : 'Новый участник'}
        </DialogTitle>
        <Box component="form" onSubmit={handleSubmit}>
          <DialogContent>
            <TextField
              fullWidth
              label="Название"
              margin="normal"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <TextField
              fullWidth
              label="Тип"
              margin="normal"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              required
            />
            <TextField
              fullWidth
              label="Описание"
              margin="normal"
              multiline
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  color="primary"
                />
              }
              label="Активен"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleFormClose}>Отмена</Button>
            <Button type="submit" variant="contained">Сохранить</Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={deleteDialog.open}
        onClose={handleDeleteCancel}
      >
        <DialogTitle>Подтвердите удаление</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Вы уверены, что хотите удалить участника:
            <br />
            <strong>{deleteDialog.name}</strong>
            <br /><br />
            Если с ним связаны платежи, удаление будет отклонено.
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

export default ContributorsPage;
