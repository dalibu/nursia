import React, { useState, useEffect, createContext, useContext } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, Container, Box, Menu, MenuItem, Chip, IconButton } from '@mui/material';
import { ExpandMore, Timer, Stop, Pause, PlayArrow, Coffee, AccessTime } from '@mui/icons-material';
import axios from 'axios';
import useIdleTimer from '../hooks/useIdleTimer';

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
  const [activeSession, setActiveSession] = useState(null);
  const [elapsedTime, setElapsedTime] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    checkUserRole();
    checkActiveSession();
    const sessionInterval = setInterval(checkActiveSession, 30000);
    const timerInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => {
      clearInterval(sessionInterval);
      clearInterval(timerInterval);
    };
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
      const isAdminUser = response.data.role === 'admin';
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

  const checkActiveSession = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/work-sessions/active', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data && response.data.length > 0) {
        setActiveSession(response.data[0]);
      } else {
        setActiveSession(null);
      }
    } catch (error) {
      console.error('Failed to check active session:', error);
    }
  };

  const stopActiveSession = async () => {
    if (!activeSession) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/work-sessions/${activeSession.id}/stop`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setActiveSession(null);
    } catch (error) {
      console.error('Failed to stop session:', error);
    }
  };

  const togglePauseSession = async () => {
    if (!activeSession) return;
    try {
      const token = localStorage.getItem('token');
      const endpoint = activeSession.session_type === 'pause' ? 'resume' : 'pause';
      await axios.post(`/api/work-sessions/${activeSession.id}/${endpoint}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Refresh to get correct aggregated times
      await checkActiveSession();
    } catch (error) {
      console.error('Failed to toggle pause:', error);
    }
  };

  const formatSeconds = (secs) => {
    if (isNaN(secs) || secs < 0) secs = 0;
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = secs % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const getAssignmentTimes = () => {
    if (!activeSession) return { work: '00:00:00', pause: '00:00:00' };

    // Calculate current segment time
    const dateTimeStr = `${activeSession.session_date}T${activeSession.start_time}`;
    const start = new Date(dateTimeStr);
    const now = currentTime;
    const currentSegmentSeconds = Math.max(0, Math.floor((now - start) / 1000));

    // Calculate totals
    let workSeconds = activeSession.total_work_seconds || 0;
    let pauseSeconds = activeSession.total_pause_seconds || 0;

    // Add current segment to appropriate counter
    if (activeSession.session_type === 'pause') {
      pauseSeconds += currentSegmentSeconds;
    } else {
      workSeconds += currentSegmentSeconds;
    }

    return {
      work: formatSeconds(workSeconds),
      pause: formatSeconds(pauseSeconds)
    };
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
      <Box sx={{ flexGrow: 1 }}>
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <img src="/favicon.svg" alt="Nursia" style={{ width: 32, height: 32 }} />
              NURSIA | {userName}
            </Typography>

            {/* Active Session Timer */}
            {activeSession && (
              <Chip
                icon={activeSession.session_type === 'pause' ? <Pause /> : <Timer />}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span onClick={() => navigate('/time-tracker')} style={{ cursor: 'pointer' }}>
                      {activeSession.worker_name}: <AccessTime sx={{ fontSize: 16, verticalAlign: 'middle' }} /> {getAssignmentTimes().work} | <Coffee sx={{ fontSize: 16, verticalAlign: 'middle' }} /> {getAssignmentTimes().pause}
                    </span>
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); togglePauseSession(); }}
                      sx={{ p: 0, color: 'white' }}
                    >
                      {activeSession.session_type === 'pause' ? <PlayArrow fontSize="small" /> : <Pause fontSize="small" />}
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); stopActiveSession(); }}
                      sx={{ p: 0, color: 'white' }}
                    >
                      <Stop fontSize="small" />
                    </IconButton>
                  </Box>
                }
                sx={{
                  mx: 2,
                  backgroundColor: activeSession.session_type === 'pause' ? '#ff9800' : '#4caf50',
                  color: 'white',
                  fontFamily: 'monospace',
                  fontSize: '1rem',
                  '& .MuiChip-icon': { color: 'white' },
                  '& .MuiChip-label': { pr: 1 }
                }}
              />
            )}

            <Box sx={{ flexGrow: 1 }} />
            <Button color="inherit" component={Link} to="/">
              Обозрение
            </Button>
            <Button color="inherit" component={Link} to="/time-tracker">
              ⏱️ Время
            </Button>
            <Button color="inherit" component={Link} to="/payments">
              Платежи
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
                  <MenuItem component={Link} to="/requests" onClick={() => setSettingsAnchor(null)}>
                    Заявки {hasRequests && '⚠️'}
                  </MenuItem>
                  <MenuItem component={Link} to="/user-status" onClick={() => setSettingsAnchor(null)}>
                    Статусы пользователей
                  </MenuItem>
                  <MenuItem component={Link} to="/categories" onClick={() => setSettingsAnchor(null)}>
                    Категории
                  </MenuItem>
                  <MenuItem component={Link} to="/contributors" onClick={() => setSettingsAnchor(null)}>
                    Участники
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