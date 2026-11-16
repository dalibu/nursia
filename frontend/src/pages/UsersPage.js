import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Box, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Button, MenuItem,
  DialogContentText, Chip, Alert, Tooltip
} from '@mui/material';
import { Edit, Delete, PersonAdd, ContentCopy, Restore } from '@mui/icons-material';
import { useNotifications } from '../components/Layout';
import CustomTablePagination from '../components/CustomTablePagination';

function UsersPage() {
  const { t } = useTranslation();
  const { checkRequests } = useNotifications();
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    full_name: '',
    email: '',
    role: 'worker',
    status: 'active'
  });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, userId: null, userName: '' });
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [searchFilter, setSearchFilter] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [roles, setRoles] = useState([]);

  const [message, setMessage] = useState('');

  // Состояния для создания нового пользователя
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createFormData, setCreateFormData] = useState({
    username: '',
    full_name: '',
    email: '',
    role: 'worker'
  });
  const [createdUserInfo, setCreatedUserInfo] = useState(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);

  useEffect(() => {
    loadUsers();
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

  const loadUsers = async () => {
    try {
      const url = showDeleted ? '/api/users/?include_deleted=true' : '/api/users/';
      const response = await fetch(url, {
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

  // Создание нового пользователя
  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/users/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(createFormData)
      });

      if (!response.ok) {
        const error = await response.json();
        setMessage(t('users.errorPrefix', { detail: error.detail }));
        return;
      }

      const result = await response.json();
      setCreatedUserInfo({
        username: result.user.username,
        password: result.generated_password,
        full_name: result.user.full_name
      });
      setShowCreateDialog(false);
      setShowPasswordDialog(true);
      setCreateFormData({ username: '', full_name: '', email: '', role: 'user' });
      loadUsers();
    } catch (error) {
      console.error('Failed to create user:', error);
      setMessage(t('users.createError'));
    }
  };

  const handleCopyPassword = () => {
    if (createdUserInfo?.password) {
      navigator.clipboard.writeText(createdUserInfo.password);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    }
  };

  const handleClosePasswordDialog = () => {
    setShowPasswordDialog(false);
    setCreatedUserInfo(null);
    setPasswordCopied(false);
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
      setMessage(t('users.approvedMessage'));
      loadUsers();
    } catch (error) {
      setMessage(t('users.approveError'));
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
      setMessage(t('users.rejectedMessage'));

    } catch (error) {
      setMessage(t('users.rejectError'));
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
      role: user.roles && user.roles.length > 0 ? user.roles[0] : 'worker',
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
    setFormData({ username: '', full_name: '', email: '', role: 'worker', status: 'active' });
  };

  const handleRestoreUser = async (userId) => {
    try {
      const response = await fetch(`/api/users/${userId}/restore`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        setMessage(t('users.restoredMessage'));
        loadUsers();
      } else {
        const error = await response.json();
        setMessage(t('users.errorPrefix', { detail: error.detail }));
      }
    } catch (error) {
      console.error('Failed to restore user:', error);
      setMessage(t('users.restoreError'));
    }
  };

  // Reload users when showDeleted changes
  useEffect(() => {
    loadUsers();
  }, [showDeleted]);

  const filteredUsers = users.filter(user => {
    if (!searchFilter) return true;
    const search = searchFilter.toLowerCase();
    return (
      user.username.toLowerCase().includes(search) ||
      user.full_name.toLowerCase().includes(search) ||
      (user.email && user.email.toLowerCase().includes(search)) ||
      (user.roles && user.roles.join(', ').toLowerCase().includes(search)) ||
      user.status.toLowerCase().includes(search) ||
      user.id.toString().includes(search)
    );
  });

  return (
    <Box>
      {message && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setMessage('')}>
          {message}
        </Alert>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h6">
            {t('users.title')} ({users.length})
          </Typography>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
              style={{ marginRight: 4 }}
            />
            {t('users.showDeleted')}
          </label>
        </Box>
        <Button
          variant="contained"
          startIcon={<PersonAdd />}
          onClick={() => setShowCreateDialog(true)}
        >
          {t('users.addUser')}
        </Button>
      </Box>

      <Box sx={{ mb: 2 }}>
        <TextField
          fullWidth
          label={t('common.search')}
          variant="outlined"
          value={searchFilter}
          onChange={(e) => {
            setSearchFilter(e.target.value);
            setPage(0);
          }}
          placeholder={t('users.searchPlaceholder')}
        />
      </Box>

      <TableContainer component={Paper} sx={{ maxHeight: '70vh' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow hover>
              <TableCell>{t('users.id')}</TableCell>
              <TableCell>{t('users.username')}</TableCell>
              <TableCell>{t('users.fullName')}</TableCell>
              <TableCell>{t('users.email')}</TableCell>
              <TableCell>{t('users.role')}</TableCell>
              <TableCell>{t('common.status')}</TableCell>
              <TableCell>{t('users.registeredAt')}</TableCell>
              <TableCell>{t('users.updatedAt')}</TableCell>
              <TableCell sx={{ width: 120 }}>{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredUsers
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((user) => (
                <TableRow key={user.id} sx={{ opacity: user.status === 'deleted' ? 0.5 : 1, bgcolor: user.status === 'deleted' ? 'action.hover' : 'inherit' }} hover>
                  <TableCell>{user.id}</TableCell>
                  <TableCell>{user.username}</TableCell>
                  <TableCell>{user.full_name}</TableCell>
                  <TableCell>{user.email || '-'}</TableCell>
                  <TableCell>{user.roles ? user.roles.join(', ') : '-'}</TableCell>
                  <TableCell>
                    <Chip
                      label={
                        user.status === 'active' ? t('profile.statusActive') :
                          user.status === 'pending' ? t('profile.statusPending') :
                            user.status === 'blocked' ? t('profile.statusBlocked') :
                              user.status === 'deleted' ? t('users.deleted') : user.status
                      }
                      color={user.status === 'active' ? 'success' : user.status === 'pending' ? 'warning' : user.status === 'deleted' ? 'default' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{user.updated_at ? new Date(user.updated_at).toLocaleDateString() : '-'}</TableCell>
                  <TableCell>
                    {user.status === 'deleted' ? (
                      <Tooltip title={t('users.restore')}>
                        <IconButton onClick={() => handleRestoreUser(user.id)} color="primary">
                          <Restore />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <>
                        <IconButton onClick={() => handleEdit(user)}>
                          <Edit />
                        </IconButton>
                        <IconButton onClick={() => handleDeleteClick(user)}>
                          <Delete />
                        </IconButton>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>

      <CustomTablePagination
        count={filteredUsers.length}
        page={page}
        onPageChange={(event, newPage) => setPage(newPage)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(event) => {
          setRowsPerPage(parseInt(event.target.value, 10));
          setPage(0);
        }}
        rowsPerPageOptions={[10, 25, 50]}
        isFiltered={Boolean(searchFilter)}
        totalCount={users.length}
      />

      <Dialog open={showForm} onClose={handleFormClose} maxWidth="sm" fullWidth>
        <DialogTitle>{t('users.editTitle')}</DialogTitle>
        <Box component="form" onSubmit={handleSubmit}>
          <DialogContent>
            <TextField
              fullWidth
              label={t('users.username')}
              margin="normal"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
            <TextField
              fullWidth
              label={t('users.fullName')}
              margin="normal"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              required
            />
            <TextField
              fullWidth
              label={t('users.email')}
              type="email"
              margin="normal"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
            <TextField
              fullWidth
              select
              label={t('users.role')}
              margin="normal"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            >
              {roles.map((role) => (
                <MenuItem key={role.id} value={role.name}>
                  {role.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth
              select
              label={t('common.status')}
              margin="normal"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              <MenuItem value="active">{t('profile.statusActive')}</MenuItem>
              <MenuItem value="pending">{t('profile.statusPending')}</MenuItem>
              <MenuItem value="blocked">{t('profile.statusBlocked')}</MenuItem>
            </TextField>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleFormClose}>{t('common.cancel')}</Button>
            <Button type="submit" variant="contained">{t('common.save')}</Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, userId: null, userName: '' })}>
        <DialogTitle>{t('users.confirmDeleteTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('users.confirmDeleteMessage', { name: deleteDialog.userName })}
            <br /><br />
            {t('users.deactivateHint')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, userId: null, userName: '' })}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            {t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmDialog} onClose={() => setConfirmDialog(false)}>
        <DialogTitle>{t('users.confirmSaveTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('users.confirmSaveMessage')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleConfirmSave} variant="contained">{t('common.save')}</Button>
        </DialogActions>
      </Dialog>

      {/* Диалог создания нового пользователя */}
      <Dialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('users.addUserTitle')}</DialogTitle>
        <Box component="form" onSubmit={handleCreateUser}>
          <DialogContent>
            <Alert severity="info" sx={{ mb: 2 }}>
              {t('users.passwordGeneratedHint')}
            </Alert>
            <TextField
              fullWidth
              label={t('users.username')}
              margin="normal"
              value={createFormData.username}
              onChange={(e) => setCreateFormData({ ...createFormData, username: e.target.value })}
              required
              autoFocus
            />
            <TextField
              fullWidth
              label={t('users.fullName')}
              margin="normal"
              value={createFormData.full_name}
              onChange={(e) => setCreateFormData({ ...createFormData, full_name: e.target.value })}
              required
            />
            <TextField
              fullWidth
              label={t('users.email')}
              type="email"
              margin="normal"
              value={createFormData.email}
              onChange={(e) => setCreateFormData({ ...createFormData, email: e.target.value })}
            />
            <TextField
              fullWidth
              select
              label={t('users.role')}
              margin="normal"
              value={createFormData.role}
              onChange={(e) => setCreateFormData({ ...createFormData, role: e.target.value })}
            >
              {roles.map((role) => (
                <MenuItem key={role.id} value={role.name}>
                  {role.name}
                </MenuItem>
              ))}
            </TextField>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowCreateDialog(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="contained">{t('common.create')}</Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* Диалог показа сгенерированного пароля */}
      <Dialog open={showPasswordDialog} onClose={handleClosePasswordDialog} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: 'success.main' }}>✓ {t('users.createdTitle')}</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('users.copyPasswordWarning')}
          </Alert>
          <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1, mb: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {t('users.userLabel')}
            </Typography>
            <Typography variant="body1" fontWeight="bold">
              {createdUserInfo?.full_name} ({createdUserInfo?.username})
            </Typography>
          </Box>
          <Box sx={{ p: 2, bgcolor: 'action.selected', borderRadius: 1, border: '2px dashed', borderColor: 'primary.main' }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {t('users.tempPasswordLabel')}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6" fontFamily="monospace" sx={{ letterSpacing: 1 }}>
                {createdUserInfo?.password}
              </Typography>
              <Tooltip title={passwordCopied ? t('common.copied') : t('common.copy')}>
                <IconButton onClick={handleCopyPassword} color={passwordCopied ? "success" : "primary"}>
                  <ContentCopy />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePasswordDialog} variant="contained">
            {t('common.close')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default UsersPage;