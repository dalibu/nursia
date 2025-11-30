import React, { useState, useEffect } from 'react';
import {
  Typography, Paper, Box, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Alert
} from '@mui/material';
import { Check, Close } from '@mui/icons-material';
import api from '../services/api';

function AdminPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      const response = await api.get('/admin/registration-requests');
      setRequests(response.data);
    } catch (error) {
      console.error('Failed to load requests:', error);
    }
  };

  const handleApprove = async (requestId) => {
    setLoading(true);
    try {
      await api.post(`/admin/registration-requests/${requestId}/approve`);
      setMessage('Пользователь одобрен и создан');
      loadRequests();
    } catch (error) {
      setMessage('Ошибка при одобрении');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (requestId) => {
    setLoading(true);
    try {
      await api.post(`/admin/registration-requests/${requestId}/reject`);
      setMessage('Заявка отклонена');
      loadRequests();
    } catch (error) {
      setMessage('Ошибка при отклонении');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Заявки на регистрацию
      </Typography>

      {message && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setMessage('')}>
          {message}
        </Alert>
      )}

      {requests.length === 0 ? (
        <Paper sx={{ p: 3 }}>
          <Typography>Нет новых заявок</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
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
                          disabled={loading}
                          onClick={() => handleApprove(request.id)}
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
                      </Box>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

export default AdminPage;