import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Container, Paper, TextField, Button, Typography, Box, Alert } from '@mui/material';
import { auth } from '../services/api';

// Простое хеширование на клиенте
const hashPassword = async (password) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

function RegisterPage() {
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
    if (password.length < 8) {
      return 'Пароль должен содержать минимум 8 символов';
    }
    if (!/[0-9]/.test(password)) {
      return 'Пароль должен содержать минимум 1 цифру';
    }
    if (!/[a-zA-Zа-яА-Я]/.test(password)) {
      return 'Пароль должен содержать буквы (латиница или кириллица)';
    }
    return '';
  };

  const handlePasswordChange = (e) => {
    const password = e.target.value;
    setFormData({...formData, password});
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
        setError(error.response.data.detail || 'Пользователь уже существует');
      } else {
        setError('Ошибка регистрации');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Paper elevation={3} sx={{ p: 4 }}>
          <Typography variant="h4" align="center" gutterBottom>
            Заявка отправлена
          </Typography>
          <Alert severity="success" sx={{ mb: 2 }}>
            Ваша заявка на регистрацию отправлена администратору. 
            Ожидайте подтверждения.
          </Alert>
          <Button
            component={Link}
            to="/login"
            fullWidth
            variant="contained"
            sx={{ mt: 2 }}
          >
            Вернуться к входу
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h4" align="center" gutterBottom>
          Регистрация
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box component="form" onSubmit={handleSubmit}>
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
            label="Пароль"
            type="password"
            margin="normal"
            value={formData.password}
            onChange={handlePasswordChange}
            error={!!passwordError}
            helperText={passwordError || passwordRules}
            required
          />
          <TextField
            fullWidth
            label="Email (необязательно)"
            type="email"
            margin="normal"
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
          />
          <TextField
            fullWidth
            label="Полное имя"
            margin="normal"
            value={formData.full_name}
            onChange={(e) => setFormData({...formData, full_name: e.target.value})}
            required
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            disabled={loading}
            sx={{ mt: 3 }}
          >
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </Button>
          <Button
            component={Link}
            to="/login"
            fullWidth
            variant="text"
            sx={{ mt: 1 }}
          >
            Уже есть аккаунт? Войти
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}

export default RegisterPage;