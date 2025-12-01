import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, Container, Box, Menu, MenuItem } from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import axios from 'axios';

function Layout({ onLogout }) {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [userName, setUserName] = useState('');
  const [settingsAnchor, setSettingsAnchor] = useState(null);

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
          <Button color="inherit" component={Link} to="/reports">
            Отчеты
          </Button>
          {isAdmin && (
            <>
              <Button 
                color="inherit" 
                onClick={(e) => setSettingsAnchor(e.currentTarget)}
                endIcon={<ExpandMore />}
              >
                Настройки
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
                <MenuItem component={Link} to="/categories" onClick={() => setSettingsAnchor(null)}>
                  Категории
                </MenuItem>
                <MenuItem component={Link} to="/currencies" onClick={() => setSettingsAnchor(null)}>
                  Валюты
                </MenuItem>
              </Menu>
            </>
          )}
          <Button color="inherit" component={Link} to="/profile">
            Профиль
          </Button>
          {isAdmin && (
            <Button color="inherit" component={Link} to="/users">
              Пользователи
            </Button>
          )}
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