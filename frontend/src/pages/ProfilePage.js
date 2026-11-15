import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Typography, Paper, TextField, Button, Box, Alert, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText
} from '@mui/material';
import PasswordField from '../components/PasswordField';
import CryptoJS from 'crypto-js';

function ProfilePage() {
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState({ username: '', full_name: '', email: '', role: '', status: '' });
  const [formData, setFormData] = useState({ username: '', full_name: '', email: '', role: '', status: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [originalData, setOriginalData] = useState({});
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [passwordData, setPasswordData] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordErrorMsg, setPasswordErrorMsg] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const response = await fetch('/api/users/me', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
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
      setError(t('profile.loadError'));
    }
  };

  const hasChanges = () => JSON.stringify(formData) !== JSON.stringify(originalData);

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
        setMessage(t('profile.updateSuccess'));
        loadProfile();
      } else {
        setError(t('profile.updateError'));
      }
    } catch (error) {
      console.error('Failed to update profile:', error);
      setError(t('profile.updateError'));
    } finally {
      setLoading(false);
    }
  };

  const validatePassword = (password) => {
    if (password.length < 6) return t('auth.passwordMinLength');
    if (!/[0-9]/.test(password)) return t('auth.passwordRequireDigit');
    if (!/[a-zA-Zа-яА-ЯіІїЇєЄґҐäöüÄÖÜß]/.test(password)) return t('auth.passwordRequireLetter');
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
      setPasswordErrorMsg(t('profile.passwordsDoNotMatch'));
      return;
    }
    setPasswordLoading(true);
    setPasswordMessage('');
    setPasswordErrorMsg('');
    try {
      const response = await fetch('/api/users/me/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          old_password: CryptoJS.SHA256(passwordData.oldPassword).toString(),
          new_password: CryptoJS.SHA256(passwordData.newPassword).toString(),
          confirm_password: CryptoJS.SHA256(passwordData.confirmPassword).toString()
        })
      });
      if (response.ok) {
        setPasswordMessage(t('profile.passwordChangeSuccess'));
        setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        const errorData = await response.json();
        setPasswordErrorMsg(errorData.detail || t('profile.passwordChangeError'));
      }
    } catch (error) {
      console.error('Failed to change password:', error);
      setPasswordErrorMsg(t('profile.passwordChangeError'));
    } finally {
      setPasswordLoading(false);
    }
  };

  const currentLocale = i18n.language === 'uk' ? 'uk-UA' : i18n.language || 'uk-UA';

  return (
    <Box>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>{t('profile.editTitle')}</Typography>
        {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box component="form" onSubmit={handleSubmit}>
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
          {(profile.roles?.includes('admin') || profile.role === 'admin') && (
            <>
              <TextField
                fullWidth
                select
                label={t('users.role')}
                margin="normal"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                <MenuItem value="user">{t('profile.roleUser')}</MenuItem>
                <MenuItem value="admin">{t('profile.roleAdmin')}</MenuItem>
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
            </>
          )}
          <Button type="submit" variant="contained" disabled={loading || !hasChanges()} sx={{ mt: 2 }}>
            {loading ? t('common.saving') : t('common.save')}
          </Button>

          <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary">
              {t('users.registeredAt')}: {profile.created_at ? new Date(profile.created_at).toLocaleDateString(currentLocale) : ''}
            </Typography>
            {profile.updated_at && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {t('users.updatedAt')}: {new Date(profile.updated_at).toLocaleDateString(currentLocale)}
              </Typography>
            )}
          </Box>
        </Box>
      </Paper>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>{t('profile.changePasswordTitle')}</Typography>
        {passwordMessage && <Alert severity="success" sx={{ mb: 2 }}>{passwordMessage}</Alert>}
        {passwordErrorMsg && <Alert severity="error" sx={{ mb: 2 }}>{passwordErrorMsg}</Alert>}

        <Box component="form" onSubmit={handlePasswordSubmit}>
          <PasswordField
            fullWidth
            label={t('profile.oldPassword')}
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
            label={t('profile.newPassword')}
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
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            {t('auth.passwordRulesHint')}
          </Typography>
          <PasswordField
            fullWidth
            label={t('profile.confirmPassword')}
            margin="normal"
            value={passwordData.confirmPassword}
            onChange={(e) => {
              setPasswordData({ ...passwordData, confirmPassword: e.target.value });
              setPasswordMessage('');
              setPasswordErrorMsg('');
            }}
            required
          />
          <Button type="submit" variant="outlined" disabled={passwordLoading} sx={{ mt: 2 }}>
            {passwordLoading ? t('profile.changingPassword') : t('profile.changePasswordButton')}
          </Button>
        </Box>
      </Paper>

      <Dialog open={confirmDialog} onClose={() => setConfirmDialog(false)}>
        <DialogTitle>{t('profile.confirmSaveTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('profile.confirmSaveMessage')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleConfirmSave} variant="contained">{t('common.save')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ProfilePage;
