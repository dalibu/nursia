import React, { useState, useEffect } from 'react';
import {
  Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Box, MenuItem,
  Select, FormControl, InputLabel, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField,
  Chip, Alert
} from '@mui/material';
import { Edit, LockReset } from '@mui/icons-material';

function UserStatusPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editDialog, setEditDialog] = useState({ open: false, user: null });
  const [resetDialog, setResetDialog] = useState({ open: false, user: null });
  const [statusUpdate, setStatusUpdate] = useState({ status: '', reason: '' });
  const [alert, setAlert] = useState({ show: false, message: '', severity: 'success' });

  const statusColors = {
    pending: 'warning',
    active: 'success',
    blocked: 'error',
    reseted: 'info'
  };

  const statusLabels = {
    pending: 'Ожидает',
    active: 'Активен',
    blocked: 'Заблокирован',
    reseted: 'Сброшен пароль'
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/user-status/', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        showAlert('Ошибка загрузки пользователей', 'error');
      }
    } catch (error) {
      console.error('Error loading users:', error);
      showAlert('Ошибка загрузки пользователей', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showAlert = (message, severity = 'success') => {
    setAlert({ show: true, message, severity });
    setTimeout(() => setAlert({ show: false, message: '', severity: 'success' }), 5000);
  };

  const handleEditClick = (user) => {
    setEditDialog({ open: true, user });
    setStatusUpdate({ status: user.status, reason: '' });
  };

  const handleResetClick = (user) => {
    setResetDialog({ open: true, user });
  };

  const handleStatusUpdate = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/user-status/${editDialog.user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(statusUpdate)
      });

      if (response.ok) {
        showAlert('Статус пользователя обновлен');
        loadUsers();
        setEditDialog({ open: false, user: null });
      } else {
        showAlert('Ошибка обновления статуса', 'error');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      showAlert('Ошибка обновления статуса', 'error');
    }
  };

  const handlePasswordReset = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/user-status/${resetDialog.user.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        showAlert('Пароль пользователя сброшен');
        loadUsers();
        setResetDialog({ open: false, user: null });
      } else {
        showAlert('Ошибка сброса пароля', 'error');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      showAlert('Ошибка сброса пароля', 'error');
    }
  };

  if (loading) {
    return <Typography>Загрузка...</Typography>;
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Управление статусами пользователей
      </Typography>

      {alert.show && (
        <Alert severity={alert.severity} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Имя пользователя</TableCell>
              <TableCell>Полное имя</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Роль</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Смена пароля</TableCell>
              <TableCell>Дата создания</TableCell>
              <TableCell>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.id}</TableCell>
                <TableCell>{user.username}</TableCell>
                <TableCell>{user.full_name}</TableCell>
                <TableCell>{user.email || '-'}</TableCell>
                <TableCell>{user.role}</TableCell>
                <TableCell>
                  <Chip
                    label={statusLabels[user.status] || user.status}
                    color={statusColors[user.status] || 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  {user.force_password_change ? (
                    <Chip label="Требуется" color="warning" size="small" />
                  ) : (
                    <Chip label="Не требуется" color="default" size="small" />
                  )}
                </TableCell>
                <TableCell>
                  {new Date(user.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <IconButton
                    onClick={() => handleEditClick(user)}
                    size="small"
                    title="Изменить статус"
                  >
                    <Edit />
                  </IconButton>
                  <IconButton
                    onClick={() => handleResetClick(user)}
                    size="small"
                    title="Сбросить пароль"
                  >
                    <LockReset />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Диалог редактирования статуса */}
      <Dialog open={editDialog.open} onClose={() => setEditDialog({ open: false, user: null })}>
        <DialogTitle>Изменить статус пользователя</DialogTitle>
        <DialogContent>
          <Box sx={{ minWidth: 300, pt: 1 }}>
            <Typography variant="body2" gutterBottom>
              Пользователь: {editDialog.user?.full_name} ({editDialog.user?.username})
            </Typography>
            
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Статус</InputLabel>
              <Select
                value={statusUpdate.status}
                label="Статус"
                onChange={(e) => setStatusUpdate({ ...statusUpdate, status: e.target.value })}
              >
                <MenuItem value="pending">Ожидает</MenuItem>
                <MenuItem value="active">Активен</MenuItem>
                <MenuItem value="blocked">Заблокирован</MenuItem>
                <MenuItem value="reseted">Сброшен пароль</MenuItem>
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="Причина изменения"
              multiline
              rows={3}
              value={statusUpdate.reason}
              onChange={(e) => setStatusUpdate({ ...statusUpdate, reason: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog({ open: false, user: null })}>
            Отмена
          </Button>
          <Button onClick={handleStatusUpdate} variant="contained">
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог сброса пароля */}
      <Dialog open={resetDialog.open} onClose={() => setResetDialog({ open: false, user: null })}>
        <DialogTitle>Сбросить пароль пользователя</DialogTitle>
        <DialogContent>
          <Typography>
            Вы уверены, что хотите сбросить пароль пользователя{' '}
            <strong>{resetDialog.user?.full_name}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            После сброса пользователь будет обязан установить новый пароль при следующем входе.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetDialog({ open: false, user: null })}>
            Отмена
          </Button>
          <Button onClick={handlePasswordReset} variant="contained" color="warning">
            Сбросить пароль
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default UserStatusPage;