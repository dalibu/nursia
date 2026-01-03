import React, { useState, useEffect } from 'react';
import {
  Typography, Paper, TextField, Button, Box, Alert, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText
} from '@mui/material';
import PasswordField from '../components/PasswordField';
import CryptoJS from 'crypto-js';

function ProfilePage() {
  const [profile, setProfile] = useState({
    username: '',
    full_name: '',
    email: '',
    role: '',
    status: ''
  });
  const [formData, setFormData] = useState({
    username: '',
    full_name: '',
    email: '',
    role: '',
    status: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [originalData, setOriginalData] = useState({});
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [passwordData, setPasswordData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordRules, setPasswordRules] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordErrorMsg, setPasswordErrorMsg] = useState('');

  useEffect(() => {
    loadProfile();
    loadPasswordRules();
  }, []);

  const loadProfile = async () => {
    try {
      const response = await fetch('/api/users/me', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setProfile(data);
      const formDataObj = {
        username: data.username,
        full_name: data.full_name,
        email: data.email || '',
        role: data.role,
        status: data.status
      };
      setFormData(formDataObj);
      setOriginalData(formDataObj);
    } catch (error) {
      console.error('Failed to load profile:', error);
      setError('Ошибка загрузки профиля');
    }
  };

  const loadPasswordRules = async () => {
    try {
      const response = await fetch('/api/users/password-rules');
      const data = await response.json();
      setPasswordRules(data.rules);
    } catch (error) {
      console.error('Failed to load password rules:', error);
    }
  };

  const hasChanges = () => {
    return JSON.stringify(formData) !== JSON.stringify(originalData);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setConfirmDialog(true);
  };

  const handleConfirmSave = async () => {
    setConfirmDialog(false);
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/users/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setMessage('Профиль успешно обновлен');
        loadProfile();
      } else {
        setError('Ошибка обновления профиля');
      }
    } catch (error) {
      console.error('Failed to update profile:', error);
      setError('Ошибка обновления профиля');
    } finally {
      setLoading(false);
    }
  };

  const validatePassword = (password) => {
    if (password.length < 6) {
      return 'Пароль должен содержать минимум 6 символов';
    }
    if (!/[0-9]/.test(password)) {
      return 'Пароль должен содержать минимум 1 цифру';
    }
    if (!/[a-zA-Zа-яА-Я]/.test(password)) {
      return 'Пароль должен содержать буквы';
    }
    return '';
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();

    const validationError = validatePassword(passwordData.newPassword);
    if (validationError) {
      setPasswordErrorMsg(validationError);
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordErrorMsg('Новые пароли не совпадают');
      return;
    }

    setPasswordLoading(true);
    setPasswordMessage('');
    setPasswordErrorMsg('');

    try {
      // Хешируем пароли SHA-256 перед отправкой
      const oldPasswordHash = CryptoJS.SHA256(passwordData.oldPassword).toString();
      const newPasswordHash = CryptoJS.SHA256(passwordData.newPassword).toString();
      const confirmPasswordHash = CryptoJS.SHA256(passwordData.confirmPassword).toString();

      const response = await fetch('/api/users/me/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          old_password: oldPasswordHash,
          new_password: newPasswordHash,
          confirm_password: confirmPasswordHash
        })
      });

      if (response.ok) {
        setPasswordMessage('Пароль успешно изменен');
        setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        const errorData = await response.json();
        setPasswordErrorMsg(errorData.detail || 'Ошибка изменения пароля');
      }
    } catch (error) {
      console.error('Failed to change password:', error);
      setPasswordErrorMsg('Ошибка изменения пароля');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" mb={3}>Мой профиль</Typography>



      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>Редактировать профиль</Typography>

        {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Логин"
            margin="normal"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            required
          />
          <TextField
            fullWidth
            label="Полное имя"
            margin="normal"
            value={formData.full_name}
            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            required
          />
          <TextField
            fullWidth
            label="Email"
            type="email"
            margin="normal"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
          {(profile.roles?.includes('admin') || profile.role === 'admin') && (
            <>
              <TextField
                fullWidth
                select
                label="Роль"
                margin="normal"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
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
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <MenuItem value="active">Активный</MenuItem>
                <MenuItem value="pending">Ожидает</MenuItem>
                <MenuItem value="blocked">Заблокирован</MenuItem>
              </TextField>
            </>
          )}
          <Button
            type="submit"
            variant="contained"
            disabled={loading || !hasChanges()}
            sx={{ mt: 2 }}
          >
            {loading ? 'Сохранение...' : 'Сохранить'}
          </Button>

          <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid #e0e0e0' }}>
            <Typography variant="body2" color="text.secondary">
              Зарегистрирован: {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : ''}
            </Typography>
            {profile.updated_at && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Редактирован: {new Date(profile.updated_at).toLocaleDateString()}
              </Typography>
            )}
          </Box>
        </Box>
      </Paper>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>Изменить пароль</Typography>

        {passwordMessage && <Alert severity="success" sx={{ mb: 2 }}>{passwordMessage}</Alert>}
        {passwordErrorMsg && <Alert severity="error" sx={{ mb: 2 }}>{passwordErrorMsg}</Alert>}

        <Box component="form" onSubmit={handlePasswordSubmit}>
          <PasswordField
            fullWidth
            label="Текущий пароль"
            margin="normal"
            value={passwordData.oldPassword}
            onChange={(e) => {
              setPasswordData({ ...passwordData, oldPassword: e.target.value });
              setPasswordMessage('');
              setPasswordErrorMsg('');
            }}
            required
          />
          <PasswordField
            fullWidth
            label="Новый пароль"
            margin="normal"
            value={passwordData.newPassword}
            onChange={(e) => {
              const value = e.target.value;
              setPasswordData({ ...passwordData, newPassword: value });
              setPasswordError(validatePassword(value));
              setPasswordMessage('');
              setPasswordErrorMsg('');
            }}
            error={!!passwordError}
            helperText={passwordError}
            required
          />
          {passwordRules && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {passwordRules}
            </Typography>
          )}
          <PasswordField
            fullWidth
            label="Подтвердите новый пароль"
            margin="normal"
            value={passwordData.confirmPassword}
            onChange={(e) => {
              setPasswordData({ ...passwordData, confirmPassword: e.target.value });
              setPasswordMessage('');
              setPasswordErrorMsg('');
            }}
            required
          />
          <Button
            type="submit"
            variant="outlined"
            disabled={passwordLoading}
            sx={{ mt: 2 }}
          >
            {passwordLoading ? 'Изменение...' : 'Изменить пароль'}
          </Button>
        </Box>
      </Paper>

      <Dialog open={confirmDialog} onClose={() => setConfirmDialog(false)}>
        <DialogTitle>Подтвердите сохранение</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Вы уверены, что хотите сохранить изменения в профиле?
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

export default ProfilePage;