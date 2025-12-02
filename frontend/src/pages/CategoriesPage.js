import React, { useState, useEffect } from 'react';
import {
  Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Box, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, DialogContentText, TablePagination
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import { payments } from '../services/api';

function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, categoryId: null, categoryName: '' });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const response = await payments.categories();
      setCategories(response.data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCategory) {
        await payments.updateCategory(editingCategory.id, formData);
      } else {
        await payments.createCategory(formData);
      }
      handleFormClose();
      loadCategories();
    } catch (error) {
      console.error('Failed to save category:', error);
    }
  };

  const handleEdit = (category) => {
    setEditingCategory(category);
    setFormData({ name: category.name, description: category.description || '' });
    setShowForm(true);
  };

  const handleDeleteClick = (category) => {
    setDeleteDialog({
      open: true,
      categoryId: category.id,
      categoryName: category.name
    });
  };

  const handleDeleteConfirm = async () => {
    try {
      await payments.deleteCategory(deleteDialog.categoryId);
      loadCategories();
      setDeleteDialog({ open: false, categoryId: null, categoryName: '' });
    } catch (error) {
      console.error('Failed to delete category:', error);
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingCategory(null);
    setFormData({ name: '', description: '' });
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Категории платежей</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setShowForm(true)}
        >
          Добавить категорию
        </Button>
      </Box>

      <TableContainer component={Paper} sx={{ maxHeight: '70vh' }}>
        <Table size="small" stickyHeader>
          <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Название</TableCell>
              <TableCell>Описание</TableCell>
              <TableCell>Дата создания</TableCell>
              <TableCell sx={{ width: 120 }}>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {categories
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((category) => (
              <TableRow key={category.id}>
                <TableCell>{category.id}</TableCell>
                <TableCell>{category.name}</TableCell>
                <TableCell>{category.description || '-'}</TableCell>
                <TableCell>{new Date(category.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <IconButton onClick={() => handleEdit(category)}>
                    <Edit />
                  </IconButton>
                  <IconButton onClick={() => handleDeleteClick(category)}>
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
        count={categories.length}
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
          {editingCategory ? 'Редактировать категорию' : 'Новая категория'}
        </DialogTitle>
        <Box component="form" onSubmit={handleSubmit}>
          <DialogContent>
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
              label="Описание"
              margin="normal"
              multiline
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleFormClose}>Отмена</Button>
            <Button type="submit" variant="contained">Сохранить</Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, categoryId: null, categoryName: '' })}>
        <DialogTitle>Подтвердите удаление</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Вы уверены, что хотите удалить категорию "{deleteDialog.categoryName}"?
            <br /><br />
            Это действие нельзя отменить.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, categoryId: null, categoryName: '' })}>
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

export default CategoriesPage;