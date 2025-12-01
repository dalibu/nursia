import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, Container, Box } from '@mui/material';
import axios from 'axios';

function Layout({ onLogout }) {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    checkUserRole();
  }, []);

  const checkUserRole = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setIsAdmin(response.data.role === 'admin');
      setUserName(response.data.full_name || response.data.username);
    } catch (error) {
      console.error('Failed to get user info:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    onLogout();
    navigate('/login');
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            NURSIA | {userName}
          </Typography>
          <Button color="inherit" component={Link} to="/">
            Расходы
          </Button>
          {isAdmin && (
            <Button color="inherit" component={Link} to="/categories">
              Категории
            </Button>
          )}
          {isAdmin && (
            <Button color="inherit" component={Link} to="/currencies">
              Валюты
            </Button>
          )}
          <Button color="inherit" component={Link} to="/reports">
            Отчеты
          </Button>
          {isAdmin && (
            <Button color="inherit" component={Link} to="/admin">
              Админ
            </Button>
          )}
          <Button color="inherit" onClick={handleLogout}>
            Выход
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Outlet />
      </Container>
    </Box>
  );
}

export default Layout;