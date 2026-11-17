import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Container, Paper, TextField, Button, Typography, Box, Alert, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { auth } from '../services/api';
import LanguageSwitcher from '../components/LanguageSwitcher';
import ThemeSwitcher from '../components/ThemeSwitcher';

// Простое хеширование на клиенте
const hashPassword = async (password) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

function LoginPage({ onLogin }) {
  const { t, i18n } = useTranslation();
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLanguageChange = (event, newLang) => {
    if (newLang) {
      i18n.changeLanguage(newLang);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Хешируем пароль на клиенте
      const hashedPassword = await hashPassword(credentials.password);
      const loginData = {
        ...credentials,
        password: hashedPassword
      };

      const response = await auth.login(loginData);
      localStorage.setItem('token', response.data.access_token);

      // Проверяем, нужно ли сменить пароль
      if (response.data.force_password_change) {
        localStorage.setItem('force_password_change', 'true');
        onLogin();
        navigate('/change-password');
      } else {
        localStorage.removeItem('force_password_change');
        onLogin();
        navigate(response.data.profile_setup_pending ? '/profile' : '/');
      }
    } catch (error) {
      console.error('Login failed:', error);
      const detail = error.response?.data?.detail || '';
      const [, delay] = detail.split('|');

      if (error.response?.status === 401) {
        let errorMsg = t('auth.invalidCredentials');
        if (delay && parseFloat(delay) > 1) {
          errorMsg += `\n${t('auth.bruteForceDelay', { seconds: parseFloat(delay).toFixed(1) })}`;
        }
        setError(errorMsg);
      } else if (error.response?.status === 403) {
        setError(t('auth.accountNotActivated'));
      } else {
        setError(t('auth.serverError'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          <LanguageSwitcher />
          <ThemeSwitcher />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 2 }}>
          <img src="/favicon.svg" alt="NURSIA" style={{ width: 40, height: 40 }} />
          <Typography variant="h4">
            NURSIA
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2, whiteSpace: 'pre-line' }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label={t('auth.username')}
            margin="normal"
            value={credentials.username}
            onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
            required
          />
          <TextField
            fullWidth
            label={t('auth.password')}
            type="password"
            margin="normal"
            value={credentials.password}
            onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
            required
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            disabled={loading}
            sx={{ mt: 3 }}
          >
            {loading ? t('auth.loggingIn') : t('auth.login')}
          </Button>
          <Button
            component={Link}
            to="/register"
            fullWidth
            variant="text"
            sx={{ mt: 1 }}
          >
            {t('auth.noAccountRegister')}
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}

export default LoginPage;
