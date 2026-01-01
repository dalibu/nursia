import React, { useState, useEffect } from 'react';
import {
  Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Button, Box, Chip, Alert, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText,
  TextField, MenuItem
} from '@mui/material';
import { Check, Close, Delete } from '@mui/icons-material';
import { useNotifications } from '../components/Layout';

function RequestsPage() {
  const { checkRequests } = useNotifications();
  const [requests, setRequests] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [deleteDialog, setDeleteDialog] = useState({ open: false, requestId: null, requestName: '' });
  const [approveDialog, setApproveDialog] = useState({ open: false, requestId: null, username: '' });
  const [selectedRole, setSelectedRole] = useState('worker');

  useEffect(() => {
    loadRequests();
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      const response = await fetch('/api/admin/roles', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setRoles(data);
    } catch (error) {
      console.error('Failed to load roles:', error);
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
      setRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load requests:', error);
      setRequests([]);
    }
  };

  const handleApproveClick = (request) => {
    setApproveDialog({
      open: true,
      requestId: request.id,
      username: request.username
    });
  };

  const handleApproveConfirm = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/registration-requests/${approveDialog.requestId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ role: selectedRole })
      });

      if (!response.ok) {
        throw new Error('Approval failed');
      }

      setMessage(`Пользователь ${approveDialog.username} одобрен с ролью ${selectedRole}`);
      setApproveDialog({ open: false, requestId: null, username: '' });
      loadRequests();
      checkRequests();
    } catch (error) {
      setMessage('Ошибка при одобрении');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (requestId) => {
    setLoading(true);
    try {
      await fetch(`/api/admin/registration-requests/${requestId}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      setMessage('Заявка отклонена и удалена');
      loadRequests();
      checkRequests();
    } catch (error) {
      setMessage('Ошибка при отклонении');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (request) => {
    setDeleteDialog({
      open: true,
      requestId: request.id,
      requestName: request.username
    });
  };

  const handleDeleteConfirm = async () => {
    setLoading(true);
    try {
      await fetch(`/api/admin/registration-requests/${deleteDialog.requestId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      setMessage('Заявка удалена');
      loadRequests();
      checkRequests();
      setDeleteDialog({ open: false, requestId: null, requestName: '' });
    } catch (error) {
      setMessage('Ошибка при удалении');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" mb={3}>Заявки на регистрацию ({requests.length})</Typography>

      {message && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setMessage('')}>
          {message}
        </Alert>
      )}

      {requests.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">
            Нет заявок на регистрацию
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell>Логин</TableCell>
                <TableCell>Полное имя</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Дата подачи</TableCell>
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
                      color={request.status === 'pending' ? 'warning' : request.status === 'approved' ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Box display="flex" gap={1}>
                      {request.status === 'pending' && (
                        <>
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            startIcon={<Check />}
                            disabled={loading}
                            onClick={() => handleApproveClick(request)}
                          >
                            Одобрить
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            startIcon={<Close />}
                            disabled={loading}
                            onClick={() => handleReject(request.id)}
                          >
                            Отклонить
                          </Button>
                        </>
                      )}
                      <IconButton
                        size="small"
                        color="error"
                        disabled={loading}
                        onClick={() => handleDeleteClick(request)}
                      >
                        <Delete />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={approveDialog.open} onClose={() => setApproveDialog({ open: false, requestId: null, username: '' })} maxWidth="xs" fullWidth>
        <DialogTitle>Одобрение регистрации</DialogTitle>
        <DialogContent>
          <DialogContentText mb={2}>
            Выберите роль для пользователя <b>{approveDialog.username}</b>:
          </DialogContentText>
          <TextField
            select
            fullWidth
            label="Роль"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
          >
            {roles.map((role) => (
              <MenuItem key={role.id} value={role.name}>
                {role.name} ({role.description || role.type})
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApproveDialog({ open: false, requestId: null, username: '' })}>
            Отмена
          </Button>
          <Button onClick={handleApproveConfirm} color="success" variant="contained" disabled={loading}>
            Одобрить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, requestId: null, requestName: '' })}>
        <DialogTitle>Подтвердите удаление</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Вы уверены, что хотите удалить заявку пользователя "{deleteDialog.requestName}"?
            <br /><br />
            Это действие нельзя отменить.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, requestId: null, requestName: '' })}>
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

export default RequestsPage;