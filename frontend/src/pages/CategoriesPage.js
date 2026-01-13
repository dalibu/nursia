import React, { useState, useEffect } from 'react';
import {
  Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Box, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, DialogContentText, TablePagination,
  Chip, Tabs, Tab, ToggleButton, ToggleButtonGroup
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import { payments } from '../services/api';
import PageHeader from '../components/PageHeader';

// Предустановленные цвета
const PRESET_COLORS = [
  '#f44336', '#e91e63', '#9c27b0', '#673ab7',
  '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4',
  '#009688', '#4caf50', '#8bc34a', '#cddc39',
  '#ffeb3b', '#ffc107', '#ff9800', '#ff5722'
];

// Предустановленные emoji
const PRESET_EMOJIS = [
  '💰', '💳', '💵', '🏠', '🚗', '🍔', '👕', '💊',
  '🎁', '✈️', '📱', '🛒', '⚡', '🎓', '🏥', '🎭'
];

function CategoriesPage() {
  const [tab, setTab] = useState(0);

  // Groups state
  const [groups, setGroups] = useState([]);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupFormData, setGroupFormData] = useState({
    name: '', color: '#4caf50', emoji: '💰', is_active: true
  });

  // Categories state
  const [categories, setCategories] = useState([]);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryFormData, setCategoryFormData] = useState({
    name: '', group_id: null, description: ''
  });

  const [deleteDialog, setDeleteDialog] = useState({ open: false, type: '', id: null, name: '' });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  useEffect(() => {
    loadGroups();
    loadCategories();
  }, []);

  const loadGroups = async () => {
    try {
      const response = await payments.groups();
      setGroups(response.data);
    } catch (error) {
      console.error('Failed to load groups:', error);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await payments.categories();
      setCategories(response.data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  // Group handlers
  const handleGroupSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingGroup) {
        await payments.updateGroup(editingGroup.id, groupFormData);
      } else {
        await payments.createGroup(groupFormData);
      }
      setShowGroupForm(false);
      setEditingGroup(null);
      setGroupFormData({ name: '', color: '#4caf50', emoji: '💰', is_active: true });
      loadGroups();
    } catch (error) {
      console.error('Failed to save group:', error);
    }
  };

  const handleEditGroup = (group) => {
    setEditingGroup(group);
    setGroupFormData({
      name: group.name,
      color: group.color || '#4caf50',
      emoji: group.emoji || '💰',
      is_active: group.is_active
    });
    setShowGroupForm(true);
  };

  // Category handlers
  const handleCategorySubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCategory) {
        await payments.updateCategory(editingCategory.id, categoryFormData);
      } else {
        await payments.createCategory(categoryFormData);
      }
      setShowCategoryForm(false);
      setEditingCategory(null);
      setCategoryFormData({ name: '', group_id: null, description: '' });
      loadCategories();
    } catch (error) {
      console.error('Failed to save category:', error);
    }
  };

  const handleEditCategory = (category) => {
    setEditingCategory(category);
    setCategoryFormData({
      name: category.name,
      group_id: category.group_id || category.category_group?.id || null,
      description: category.description || ''
    });
    setShowCategoryForm(true);
  };

  // Delete handlers
  const handleDeleteClick = (type, item) => {
    setDeleteDialog({ open: true, type, id: item.id, name: item.name });
  };

  const handleDeleteConfirm = async () => {
    try {
      if (deleteDialog.type === 'group') {
        await payments.deleteGroup(deleteDialog.id);
        loadGroups();
      } else {
        await payments.deleteCategory(deleteDialog.id);
        loadCategories();
      }
      setDeleteDialog({ open: false, type: '', id: null, name: '' });
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const getGroupById = (groupId) => {
    return groups.find(g => g.id === groupId);
  };

  return (
    <Box>
      <PageHeader showMainMenu={true} />
      <Typography variant="h4" gutterBottom>Категории платежей</Typography>

      <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Категории" />
        <Tab label="Группы" />
      </Tabs>

      {/* Categories Tab */}
      {tab === 0 && (
        <>
          <Box display="flex" justifyContent="flex-end" mb={2}>
            <Button variant="contained" startIcon={<Add />} onClick={() => setShowCategoryForm(true)}>
              Добавить категорию
            </Button>
          </Box>

          <TableContainer component={Paper} sx={{ maxHeight: '60vh' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Название</TableCell>
                  <TableCell>Группа</TableCell>
                  <TableCell>Описание</TableCell>
                  <TableCell sx={{ width: 100 }}>Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {categories.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((cat) => {
                  const group = cat.category_group || getGroupById(cat.group_id);
                  return (
                    <TableRow key={cat.id}>
                      <TableCell>{cat.id}</TableCell>
                      <TableCell>{cat.name}</TableCell>
                      <TableCell>
                        {group ? (
                          <Chip
                            label={`${group.emoji} ${group.name}`}
                            size="small"
                            sx={{ backgroundColor: group.color, color: 'white' }}
                          />
                        ) : '-'}
                      </TableCell>
                      <TableCell>{cat.description || '-'}</TableCell>
                      <TableCell>
                        <IconButton size="small" onClick={() => handleEditCategory(cat)}><Edit /></IconButton>
                        <IconButton size="small" onClick={() => handleDeleteClick('category', cat)}><Delete /></IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={categories.length}
            page={page}
            onPageChange={(e, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
            rowsPerPageOptions={[10, 25, 50]}
          />
        </>
      )}

      {/* Groups Tab */}
      {tab === 1 && (
        <>
          <Box display="flex" justifyContent="flex-end" mb={2}>
            <Button variant="contained" startIcon={<Add />} onClick={() => setShowGroupForm(true)}>
              Добавить группу
            </Button>
          </Box>

          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Название</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell sx={{ width: 100 }}>Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell>{group.id}</TableCell>
                    <TableCell>
                      <Chip
                        label={`${group.emoji} ${group.name}`}
                        sx={{ backgroundColor: group.color, color: 'white', fontSize: '1rem' }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={group.is_active ? 'Активна' : 'Неактивна'}
                        size="small"
                        color={group.is_active ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={() => handleEditGroup(group)}><Edit /></IconButton>
                      <IconButton size="small" onClick={() => handleDeleteClick('group', group)}><Delete /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* Category Form Dialog */}
      <Dialog open={showCategoryForm} onClose={() => { setShowCategoryForm(false); setEditingCategory(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>{editingCategory ? 'Редактировать категорию' : 'Новая категория'}</DialogTitle>
        <Box component="form" onSubmit={handleCategorySubmit}>
          <DialogContent>
            <TextField
              fullWidth label="Название" margin="normal" required
              value={categoryFormData.name}
              onChange={(e) => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
            />
            <TextField
              select fullWidth label="Группа" margin="normal"
              value={categoryFormData.group_id || ''}
              onChange={(e) => setCategoryFormData({ ...categoryFormData, group_id: e.target.value || null })}
              SelectProps={{ native: true }}
            >
              <option value="">— Не выбрана —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>
              ))}
            </TextField>
            <TextField
              fullWidth label="Описание" margin="normal" multiline rows={2}
              value={categoryFormData.description}
              onChange={(e) => setCategoryFormData({ ...categoryFormData, description: e.target.value })}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { setShowCategoryForm(false); setEditingCategory(null); }}>Отмена</Button>
            <Button type="submit" variant="contained">Сохранить</Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* Group Form Dialog */}
      <Dialog open={showGroupForm} onClose={() => { setShowGroupForm(false); setEditingGroup(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>{editingGroup ? 'Редактировать группу' : 'Новая группа'}</DialogTitle>
        <Box component="form" onSubmit={handleGroupSubmit}>
          <DialogContent>
            <TextField
              fullWidth label="Название" margin="normal" required
              value={groupFormData.name}
              onChange={(e) => setGroupFormData({ ...groupFormData, name: e.target.value })}
            />

            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Цвет</Typography>
            <ToggleButtonGroup
              value={groupFormData.color}
              exclusive
              onChange={(e, v) => v && setGroupFormData({ ...groupFormData, color: v })}
              sx={{ flexWrap: 'wrap', gap: 0.5 }}
            >
              {PRESET_COLORS.map((color) => (
                <ToggleButton
                  key={color}
                  value={color}
                  sx={{
                    width: 36, height: 36, backgroundColor: color,
                    '&.Mui-selected': { border: '3px solid #000', backgroundColor: color },
                    '&:hover': { backgroundColor: color }
                  }}
                />
              ))}
            </ToggleButtonGroup>

            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Иконка</Typography>
            <ToggleButtonGroup
              value={groupFormData.emoji}
              exclusive
              onChange={(e, v) => v && setGroupFormData({ ...groupFormData, emoji: v })}
              sx={{ flexWrap: 'wrap', gap: 0.5 }}
            >
              {PRESET_EMOJIS.map((emoji) => (
                <ToggleButton
                  key={emoji}
                  value={emoji}
                  sx={{
                    width: 40, height: 40, fontSize: '1.3rem',
                    '&.Mui-selected': { backgroundColor: '#e3f2fd', border: '2px solid #2196f3' }
                  }}
                >
                  {emoji}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Box mt={2} display="flex" alignItems="center" gap={2}>
              <Typography>Превью:</Typography>
              <Chip
                label={`${groupFormData.emoji} ${groupFormData.name || 'Название'}`}
                sx={{ backgroundColor: groupFormData.color, color: 'white', fontSize: '1rem' }}
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { setShowGroupForm(false); setEditingGroup(null); }}>Отмена</Button>
            <Button type="submit" variant="contained">Сохранить</Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, type: '', id: null, name: '' })}>
        <DialogTitle>Подтвердите удаление</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Вы уверены, что хотите удалить {deleteDialog.type === 'group' ? 'группу' : 'категорию'} "{deleteDialog.name}"?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, type: '', id: null, name: '' })}>Отмена</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">Удалить</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default CategoriesPage;