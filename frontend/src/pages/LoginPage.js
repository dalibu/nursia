import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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

function LoginPage({ onLogin }) {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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
        navigate('/');
      }
    } catch (error) {
      console.error('Login failed:', error);
      const detail = error.response?.data?.detail || '';
      const [msg, delay] = detail.split('|');

      if (error.response?.status === 401) {
        let errorMsg = 'Неверный логин или пароль.';
        if (delay && parseFloat(delay) > 1) {
          errorMsg += `\nВключена защита от перебора: задержка составила ${parseFloat(delay).toFixed(1)} сек.`;
        }
        setError(errorMsg);
      } else if (error.response?.status === 403) {
        setError('Ваш аккаунт еще не активирован администратором.');
      } else {
        setError('Ошибка подключения к серверу');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h4" align="center" gutterBottom>
          Nursia
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
            value={credentials.username}
            onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
            required
          />
          <TextField
            fullWidth
            label="Пароль"
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
            {loading ? 'Вход...' : 'Войти'}
          </Button>
          <Button
            component={Link}
            to="/register"
            fullWidth
            variant="text"
            sx={{ mt: 1 }}
          >
            Нет аккаунта? Зарегистрироваться
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}

export default LoginPage;