import React, { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import {
  Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Button, Box, Chip, Alert, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText,
  TextField, MenuItem
} from '@mui/material';
import { Check, Close, Delete } from '@mui/icons-material';
import { useNotifications } from '../components/Layout';

function RequestsPage() {
  const { t, i18n } = useTranslation();
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

      setMessage(t('requests.approvedMessage', { username: approveDialog.username, role: selectedRole }));
      setApproveDialog({ open: false, requestId: null, username: '' });
      loadRequests();
      checkRequests();
    } catch (error) {
      setMessage(t('requests.approveError'));
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
      setMessage(t('requests.rejectedMessage'));
      loadRequests();
      checkRequests();
    } catch (error) {
      setMessage(t('requests.rejectError'));
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
      setMessage(t('requests.deletedMessage'));
      loadRequests();
      checkRequests();
      setDeleteDialog({ open: false, requestId: null, requestName: '' });
    } catch (error) {
      setMessage(t('requests.deleteError'));
    } finally {
      setLoading(false);
    }
  };

  const currentLocale = i18n.language === 'uk' ? 'uk-UA' : i18n.language || 'uk-UA';

  return (
    <Box>
      <Typography variant="h6" mb={3}>
        {t('requests.pageTitle', { count: requests.length })}
      </Typography>

      {message && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setMessage('')}>
          {message}
        </Alert>
      )}

      {requests.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">
            {t('requests.noRequests')}
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('users.username')}</TableCell>
                <TableCell>{t('users.fullName')}</TableCell>
                <TableCell>{t('users.email')}</TableCell>
                <TableCell>{t('requests.submittedAt')}</TableCell>
                <TableCell>{t('common.status')}</TableCell>
                <TableCell>{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id} hover>
                  <TableCell>{request.username}</TableCell>
                  <TableCell>{request.full_name}</TableCell>
                  <TableCell>{request.email}</TableCell>
                  <TableCell>
                    {new Date(request.created_at).toLocaleDateString(currentLocale)}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={
                        request.status === 'pending' ? t('profile.statusPending') :
                          request.status === 'approved' ? t('requests.statusApproved') :
                            request.status
                      }
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
                            {t('requests.approve')}
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            startIcon={<Close />}
                            disabled={loading}
                            onClick={() => handleReject(request.id)}
                          >
                            {t('requests.reject')}
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
        <DialogTitle>{t('requests.approveDialogTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText mb={2}>
            <Trans
              i18nKey="requests.selectRoleForUser"
              values={{ username: approveDialog.username }}
              components={{ b: <b /> }}
            />
          </DialogContentText>
          <TextField
            select
            fullWidth
            label={t('users.role')}
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
            {t('common.cancel')}
          </Button>
          <Button onClick={handleApproveConfirm} color="success" variant="contained" disabled={loading}>
            {t('requests.approve')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, requestId: null, requestName: '' })}>
        <DialogTitle>{t('payments.confirmDeleteTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('requests.confirmDeleteMessage', { username: deleteDialog.requestName })}
            <br /><br />
            {t('payments.irreversibleAction')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, requestId: null, requestName: '' })}>
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

export default RequestsPage;
