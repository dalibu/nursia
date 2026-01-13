import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  IconButton, 
  Tooltip, 
  Drawer, 
  Box, 
  Typography, 
  List, 
  ListItem, 
  ListItemButton, 
  ListItemIcon, 
  ListItemText,
  Divider,
  useMediaQuery,
  useTheme
} from '@mui/material';
import { 
  Settings, 
  Close,
  People,
  Security,
  Assignment,
  Folder,
  Work,
  AttachMoney,
  SettingsApplications
} from '@mui/icons-material';

const MainMenu = ({ isAdmin, hasRequests }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  const menuItems = [
    { to: '/users', icon: <People />, label: 'Пользователи' },
    { to: '/roles', icon: <Security />, label: 'Роли и права' },
    { to: '/requests', icon: <Assignment />, label: 'Заявки', badge: hasRequests },
    { to: '/categories', icon: <Folder />, label: 'Категории' },
    { to: '/employment', icon: <Work />, label: 'Трудовые отношения' },
    { to: '/currencies', icon: <AttachMoney />, label: 'Валюты' },
    { to: '/settings', icon: <SettingsApplications />, label: 'Параметры' }
  ];

  return (
    <>
      <Tooltip title="Настройки">
        <IconButton 
          onClick={toggleMenu}
          sx={{ color: 'var(--icon-color)' }}
        >
          <Settings />
        </IconButton>
      </Tooltip>
      
      <Drawer
        anchor={isMobile ? 'bottom' : 'right'}
        open={isMenuOpen}
        onClose={closeMenu}
        PaperProps={{
          sx: {
            width: isMobile ? '100%' : 360,
            maxHeight: isMobile ? '80vh' : '100%',
            borderRadius: isMobile ? '16px 16px 0 0' : 0,
            background: 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%)',
            color: 'var(--text-primary)'
          }
        }}
      >
        <Box sx={{ 
          p: 2, 
          background: 'var(--btn-primary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <Typography variant="h6" sx={{ color: 'white', fontWeight: 700 }}>
            Настройки
          </Typography>
          <IconButton onClick={closeMenu} sx={{ color: 'white' }}>
            <Close />
          </IconButton>
        </Box>

        {isAdmin && (
          <>
            <Box sx={{ px: 2, pt: 2, pb: 1 }}>
              <Typography 
                variant="caption" 
                sx={{ 
                  color: 'var(--text-secondary)', 
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  fontWeight: 600
                }}
              >
                Администрирование
              </Typography>
            </Box>
            
            <List>
              {menuItems.map((item) => (
                <ListItem key={item.to} disablePadding>
                  <ListItemButton 
                    component={Link} 
                    to={item.to}
                    onClick={closeMenu}
                    sx={{
                      '&:hover': {
                        background: 'rgba(59, 130, 246, 0.1)'
                      }
                    }}
                  >
                    <ListItemIcon sx={{ color: 'var(--accent-blue)', minWidth: 40 }}>
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText 
                      primary={item.label}
                      primaryTypographyProps={{
                        sx: { color: 'var(--text-primary)' }
                      }}
                    />
                    {item.badge && (
                      <Typography variant="body2" sx={{ color: 'var(--accent-red)' }}>
                        ⚠️
                      </Typography>
                    )}
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </>
        )}
      </Drawer>
    </>
  );
};

export default MainMenu;
