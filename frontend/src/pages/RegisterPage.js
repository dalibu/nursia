import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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

function RegisterPage() {
  const { t, i18n } = useTranslation();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    full_name: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordRules, setPasswordRules] = useState('');

  useEffect(() => {
    loadPasswordRules();
  }, []);

  const handleLanguageChange = (event, newLang) => {
    if (newLang) {
      i18n.changeLanguage(newLang);
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

  const validatePassword = (password) => {
    if (password.length < 6) {
      return t('auth.passwordMinLength');
    }
    if (!/[0-9]/.test(password)) {
      return t('auth.passwordRequireDigit');
    }
    if (!/[a-zA-Zа-яА-ЯіІїЇєЄґҐäöüÄÖÜß]/.test(password)) {
      return t('auth.passwordRequireLetter');
    }
    return '';
  };

  const handlePasswordChange = (e) => {
    const password = e.target.value;
    setFormData({ ...formData, password });
    setPasswordError(validatePassword(password));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const passwordValidation = validatePassword(formData.password);
    if (passwordValidation) {
      setPasswordError(passwordValidation);
      return;
    }

    setLoading(true);

    try {
      // Хешируем пароль на клиенте
      const hashedPassword = await hashPassword(formData.password);
      const submitData = {
        ...formData,
        password: hashedPassword
      };

      await auth.register(submitData);
      setSuccess(true);
    } catch (error) {
      console.error('Registration failed:', error);
      if (error.response?.status === 400) {
        setError(error.response.data.detail || t('auth.userAlreadyExists'));
      } else {
        setError(t('auth.registrationError'));
      }
    } finally {
      setLoading(false);
    }
  };

  const languageSwitcher = (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
      <LanguageSwitcher />
      <ThemeSwitcher />
    </Box>
  );

  if (success) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Paper elevation={3} sx={{ p: 4 }}>
          {languageSwitcher}
          <Typography variant="h6" align="center" gutterBottom>
            {t('auth.requestSentTitle')}
          </Typography>
          <Alert severity="success" sx={{ mb: 2 }}>
            {t('auth.requestSentMessage')}
          </Alert>
          <Button
            component={Link}
            to="/login"
            fullWidth
            variant="contained"
            sx={{ mt: 2 }}
          >
            {t('auth.backToLogin')}
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        {languageSwitcher}
        <Typography variant="h6" align="center" gutterBottom>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 2 }}>
            <img src="/favicon.svg" alt="NURSIA" style={{ width: 40, height: 40 }} />
            <Typography variant="h4">
              NURSIA
            </Typography>
          </Box>
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label={t('auth.username')}
            margin="normal"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            required
          />
          <TextField
            fullWidth
            label={t('auth.password')}
            type="password"
            margin="normal"
            value={formData.password}
            onChange={handlePasswordChange}
            error={!!passwordError}
            helperText={passwordError || (formData.password ? '' : t('auth.passwordRulesHint'))}
            required
          />
          <TextField
            fullWidth
            label={t('auth.emailOptional')}
            type="email"
            margin="normal"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
          <TextField
            fullWidth
            label={t('auth.fullName')}
            margin="normal"
            value={formData.full_name}
            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            required
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            disabled={loading}
            sx={{ mt: 3 }}
          >
            {loading ? t('auth.registering') : t('auth.registerButton')}
          </Button>
          <Button
            component={Link}
            to="/login"
            fullWidth
            variant="text"
            sx={{ mt: 1 }}
          >
            {t('auth.alreadyHaveAccount')}
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}

export default RegisterPage;
