import React, { useState, useEffect, createContext, useContext } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, Container, Box, Menu, MenuItem } from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import axios from 'axios';
import useIdleTimer from '../hooks/useIdleTimer';
import FloatingTimer from './FloatingTimer';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

function Layout({ onLogout }) {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [userName, setUserName] = useState('');
  const [settingsAnchor, setSettingsAnchor] = useState(null);
  const [accountAnchor, setAccountAnchor] = useState(null);
  const [hasRequests, setHasRequests] = useState(false);
  const [checkInterval, setCheckInterval] = useState(30);
  // ActiveSession context is still used by FloatingTimer child component

  useEffect(() => {
    checkUserRole();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadCheckInterval();
      checkRequests();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && checkInterval) {
      const intervalMs = checkInterval * 60 * 1000; // Переводим минуты в миллисекунды
      const interval = setInterval(checkRequests, intervalMs);
      return () => clearInterval(interval);
    }
  }, [isAdmin, checkInterval]);

  const checkUserRole = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const roles = response.data.roles || [];
      const isAdminUser = roles.includes('admin');
      setIsAdmin(isAdminUser);
      setUserName(response.data.full_name || response.data.username);

      // Проверяем заявки при логине админа
      if (isAdminUser) {
        checkRequests();
      }
    } catch (error) {
      console.error('Failed to get user info:', error);
    }
  };

  const loadCheckInterval = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/settings/requests_check_interval', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCheckInterval(parseInt(response.data.value)); // Значение в минутах
    } catch (error) {
      console.error('Failed to load check interval:', error);
    }
  };



  const checkRequests = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/admin/registration-requests', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const pendingRequests = response.data.filter(r => r.status === 'pending');
      setHasRequests(pendingRequests.length > 0);
    } catch (error) {
      console.error('Failed to check requests:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    onLogout();
    navigate('/login');
  };

  // Автоматический logout по бездействию (30 минут)
  useIdleTimer(handleLogout, 30 * 60 * 1000);

  return (
    <NotificationContext.Provider value={{ checkRequests }}>
      <FloatingTimer />
      <Box sx={{ flexGrow: 1 }}>
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <img src="/favicon.svg" alt="Nursia" style={{ width: 32, height: 32 }} />
              NURSIA | {userName}
            </Typography>

            <Box sx={{ flexGrow: 1 }} />
            <Button color="inherit" component={Link} to="/">
              Обозрение
            </Button>
            <Button color="inherit" component={Link} to="/payments">
              Платежи
            </Button>
            <Button color="inherit" component={Link} to="/time-tracker">
              Задания
            </Button>
            {isAdmin && (
              <>
                <Button
                  color="inherit"
                  onClick={(e) => setSettingsAnchor(e.currentTarget)}
                  endIcon={<ExpandMore />}
                >
                  Настройки {hasRequests && '⚠️'}
                </Button>
                <Menu
                  anchorEl={settingsAnchor}
                  open={Boolean(settingsAnchor)}
                  onClose={() => setSettingsAnchor(null)}
                  PaperProps={{
                    sx: {
                      backgroundColor: '#1976d2',
                      '& .MuiMenuItem-root': {
                        color: 'white',
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.1)'
                        }
                      }
                    }
                  }}
                >
                  <MenuItem component={Link} to="/users" onClick={() => setSettingsAnchor(null)}>
                    Пользователи
                  </MenuItem>
                  <MenuItem component={Link} to="/roles" onClick={() => setSettingsAnchor(null)}>
                    🔐 Роли и права
                  </MenuItem>
                  <MenuItem component={Link} to="/requests" onClick={() => setSettingsAnchor(null)}>
                    Заявки {hasRequests && '⚠️'}
                  </MenuItem>
                  <MenuItem component={Link} to="/categories" onClick={() => setSettingsAnchor(null)}>
                    Категории
                  </MenuItem>
                  <MenuItem component={Link} to="/employment" onClick={() => setSettingsAnchor(null)}>
                    👔 Трудовые отношения
                  </MenuItem>
                  <MenuItem component={Link} to="/currencies" onClick={() => setSettingsAnchor(null)}>
                    Валюты
                  </MenuItem>
                  <MenuItem component={Link} to="/settings" onClick={() => setSettingsAnchor(null)}>
                    Параметры
                  </MenuItem>

                </Menu>
              </>
            )}
            <Button
              color="inherit"
              onClick={(e) => setAccountAnchor(e.currentTarget)}
              endIcon={<ExpandMore />}
            >
              Аккаунт
            </Button>
            <Menu
              anchorEl={accountAnchor}
              open={Boolean(accountAnchor)}
              onClose={() => setAccountAnchor(null)}
              PaperProps={{
                sx: {
                  backgroundColor: '#1976d2',
                  '& .MuiMenuItem-root': {
                    color: 'white',
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.1)'
                    }
                  }
                }
              }}
            >
              <MenuItem component={Link} to="/profile" onClick={() => setAccountAnchor(null)}>
                Профиль
              </MenuItem>
              <MenuItem onClick={() => { setAccountAnchor(null); handleLogout(); }}>
                Выйти
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>
        <Container maxWidth="lg" sx={{ mt: 4 }}>
          <Outlet />
        </Container>
      </Box>
    </NotificationContext.Provider>
  );
}

export default Layout;