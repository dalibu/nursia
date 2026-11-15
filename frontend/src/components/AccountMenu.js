import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  useTheme as useMuiTheme
} from '@mui/material';
import { 
  AccountCircle, 
  Close,
  Person,
  Logout
} from '@mui/icons-material';

const AccountMenu = ({ onLogout }) => {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const muiTheme = useMuiTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));

  const handleLogout = () => {
    localStorage.removeItem('token');
    onLogout();
    navigate('/login');
    setIsMenuOpen(false);
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  return (
    <>
      <Tooltip title={t('nav.account')}>
        <IconButton 
          onClick={toggleMenu}
          sx={{ color: 'var(--icon-color)' }}
        >
          <AccountCircle />
        </IconButton>
      </Tooltip>
      
      <Drawer
        anchor={isMobile ? 'bottom' : 'right'}
        open={isMenuOpen}
        onClose={closeMenu}
        PaperProps={{
          sx: {
            width: isMobile ? '100%' : 320,
            maxHeight: isMobile ? '60vh' : '100%',
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
            {t('nav.account')}
          </Typography>
          <IconButton onClick={closeMenu} sx={{ color: 'white' }}>
            <Close />
          </IconButton>
        </Box>

        <List>
          <ListItem disablePadding>
            <ListItemButton 
              component={Link} 
              to="/profile"
              onClick={closeMenu}
              sx={{
                '&:hover': {
                  background: 'rgba(59, 130, 246, 0.1)'
                }
              }}
            >
              <ListItemIcon sx={{ color: 'var(--accent-blue)', minWidth: 40 }}>
                <Person />
              </ListItemIcon>
              <ListItemText 
                primary={t('nav.profile')}
                primaryTypographyProps={{
                  sx: { color: 'var(--text-primary)' }
                }}
              />
            </ListItemButton>
          </ListItem>

          <Divider sx={{ my: 1, borderColor: 'var(--border-primary)' }} />

          <ListItem disablePadding>
            <ListItemButton 
              onClick={handleLogout}
              sx={{
                '&:hover': {
                  background: 'rgba(239, 68, 68, 0.1)'
                }
              }}
            >
              <ListItemIcon sx={{ color: 'var(--accent-red)', minWidth: 40 }}>
                <Logout />
              </ListItemIcon>
              <ListItemText 
                primary={t('nav.logout')}
                primaryTypographyProps={{
                  sx: { color: 'var(--accent-red)' }
                }}
              />
            </ListItemButton>
          </ListItem>
        </List>
      </Drawer>
    </>
  );
};

export default AccountMenu;
