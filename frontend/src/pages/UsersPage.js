import React, { useState, useEffect } from 'react';
import {
  Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Box, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Button, MenuItem,
  DialogContentText, TablePagination, Chip, Alert
} from '@mui/material';
import { Edit, Delete, Check, Close } from '@mui/icons-material';

function UsersPage() {
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    full_name: '',
    email: '',
    role: 'user',
    status: 'active'
  });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, userId: null, userName: '' });
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [searchFilter, setSearchFilter] = useState('');
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadUsers();
    loadRequests();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await fetch('/api/users/', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const loadRequests = async () => {
    try {
      const response = await fetch('/api/admin/registration-requests', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setRequests(data);
    } catch (error) {
      console.error('Failed to load requests:', error);
    }
  };

  const handleApprove = async (requestId) => {
    setRequestsLoading(true);
    try {
      await fetch(`/api/admin/registration-requests/${requestId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      setMessage('Пользователь одобрен и создан');
      loadRequests();
      loadUsers();
    } catch (error) {
      setMessage('Ошибка при одобрении');
    } finally {
      setRequestsLoading(false);
    }
  };

  const handleReject = async (requestId) => {
    setRequestsLoading(true);
    try {
      await fetch(`/api/admin/registration-requests/${requestId}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      setMessage('Заявка отклонена');
      loadRequests();
    } catch (error) {
      setMessage('Ошибка при отклонении');
    } finally {
      setRequestsLoading(false);
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      full_name: user.full_name,
      email: user.email || '',
      role: user.role,
      status: user.status
    });
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setConfirmDialog(true);
  };

  const handleConfirmSave = async () => {
    setConfirmDialog(false);
    try {
      await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(formData)
      });
      handleFormClose();
      loadUsers();
    } catch (error) {
      console.error('Failed to save user:', error);
    }
  };

  const handleDeleteClick = (user) => {
    setDeleteDialog({
      open: true,
      userId: user.id,
      userName: user.full_name
    });
  };

  const handleDeleteConfirm = async () => {
    try {
      await fetch(`/api/users/${deleteDialog.userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      loadUsers();
      setDeleteDialog({ open: false, userId: null, userName: '' });
    } catch (error) {
      console.error('Failed to delete user:', error);
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingUser(null);
    setFormData({ username: '', full_name: '', email: '', role: 'user', status: 'active' });
  };

  const filteredUsers = users.filter(user => {
    if (!searchFilter) return true;
    const search = searchFilter.toLowerCase();
    return (
      user.username.toLowerCase().includes(search) ||
      user.full_name.toLowerCase().includes(search) ||
      (user.email && user.email.toLowerCase().includes(search)) ||
      user.role.toLowerCase().includes(search) ||
      user.status.toLowerCase().includes(search) ||
      user.id.toString().includes(search)
    );
  });

  return (
    <Box>
      <Typography variant="h4" mb={3}>Управление пользователями</Typography>

      {message && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setMessage('')}>
          {message}
        </Alert>
      )}

      {requests.length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Заявки на регистрацию ({requests.length})
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                <TableRow>
                  <TableCell>Логин</TableCell>
                  <TableCell>Имя</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Дата</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell>Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>{request.username}</TableCell>
                    <TableCell>{request.full_name}</TableCell>
                    <TableCell>{request.email}</TableCell>
                    <TableCell>
                      {new Date(request.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={request.status} 
                        color={request.status === 'pending' ? 'warning' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {request.status === 'pending' && (
                        <Box display="flex" gap={1}>
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            startIcon={<Check />}
                            disabled={requestsLoading}
                            onClick={() => handleApprove(request.id)}
                          >
                            Одобрить
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            startIcon={<Close />}
                            disabled={requestsLoading}
                            onClick={() => handleReject(request.id)}
                          >
                            Отклонить
                          </Button>
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      <Typography variant="h6" gutterBottom>
        Пользователи ({users.length})
      </Typography>
      
      <Box sx={{ mb: 2 }}>
        <TextField
          fullWidth
          label="Поиск по всем полям"
          variant="outlined"
          value={searchFilter}
          onChange={(e) => {
            setSearchFilter(e.target.value);
            setPage(0);
          }}
          placeholder="Введите текст для поиска..."
        />
      </Box>

      <TableContainer component={Paper} sx={{ maxHeight: '70vh' }}>
        <Table size="small" stickyHeader>
          <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Логин</TableCell>
              <TableCell>Полное имя</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Роль</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Зарегистрирован</TableCell>
              <TableCell>Редактирован</TableCell>
              <TableCell sx={{ width: 120 }}>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredUsers
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.id}</TableCell>
                <TableCell>{user.username}</TableCell>
                <TableCell>{user.full_name}</TableCell>
                <TableCell>{user.email || '-'}</TableCell>
                <TableCell>{user.role}</TableCell>
                <TableCell>{user.status}</TableCell>
                <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                <TableCell>{user.updated_at ? new Date(user.updated_at).toLocaleDateString() : '-'}</TableCell>
                <TableCell>
                  <IconButton onClick={() => handleEdit(user)}>
                    <Edit />
                  </IconButton>
                  <IconButton onClick={() => handleDeleteClick(user)}>
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
        count={filteredUsers.length}
        page={page}
        onPageChange={(event, newPage) => setPage(newPage)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(event) => {
          setRowsPerPage(parseInt(event.target.value, 10));
          setPage(0);
        }}
        rowsPerPageOptions={[10, 25, 50]}
        labelRowsPerPage="Строк на странице:"
        labelDisplayedRows={({ from, to, count }) => `${from}-${to} из ${count}${searchFilter ? ` (отфильтровано из ${users.length})` : ''}`}
      />

      <Dialog open={showForm} onClose={handleFormClose} maxWidth="sm" fullWidth>
        <DialogTitle>Редактировать пользователя</DialogTitle>
        <Box component="form" onSubmit={handleSubmit}>
          <DialogContent>
            <TextField
              fullWidth
              label="Логин"
              margin="normal"
              value={formData.username}
              onChange={(e) => setFormData({...formData, username: e.target.value})}
              required
            />
            <TextField
              fullWidth
              label="Полное имя"
              margin="normal"
              value={formData.full_name}
              onChange={(e) => setFormData({...formData, full_name: e.target.value})}
              required
            />
            <TextField
              fullWidth
              label="Email"
              type="email"
              margin="normal"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
            />
            <TextField
              fullWidth
              select
              label="Роль"
              margin="normal"
              value={formData.role}
              onChange={(e) => setFormData({...formData, role: e.target.value})}
            >
              <MenuItem value="user">Пользователь</MenuItem>
              <MenuItem value="admin">Администратор</MenuItem>
            </TextField>
            <TextField
              fullWidth
              select
              label="Статус"
              margin="normal"
              value={formData.status}
              onChange={(e) => setFormData({...formData, status: e.target.value})}
            >
              <MenuItem value="active">Активный</MenuItem>
              <MenuItem value="pending">Ожидает</MenuItem>
              <MenuItem value="blocked">Заблокирован</MenuItem>
            </TextField>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleFormClose}>Отмена</Button>
            <Button type="submit" variant="contained">Сохранить</Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, userId: null, userName: '' })}>
        <DialogTitle>Подтвердите удаление</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Вы уверены, что хотите удалить пользователя "{deleteDialog.userName}"?
            <br /><br />
            Это действие нельзя отменить.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, userId: null, userName: '' })}>
            Отмена
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Удалить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmDialog} onClose={() => setConfirmDialog(false)}>
        <DialogTitle>Подтвердите сохранение</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Вы уверены, что хотите сохранить изменения пользователя?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(false)}>Отмена</Button>
          <Button onClick={handleConfirmSave} variant="contained">Сохранить</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default UsersPage;