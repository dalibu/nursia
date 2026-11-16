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
  Menu,
  MenuItem,
  useMediaQuery,
  useTheme as useMuiTheme
} from '@mui/material';
import { 
  AccountCircle, 
  Close,
  Person,
  Logout,
  Language
} from '@mui/icons-material';
import { useTheme } from '../contexts/ThemeContext';
import { THEME_LIST } from '../config/themes';

const LANGUAGES = [
  { code: 'uk', short: 'UA', label: 'Українська' },
  { code: 'ru', short: 'RU', label: 'Русский' },
  { code: 'de', short: 'DE', label: 'Deutsch' },
  { code: 'en', short: 'EN', label: 'English' },
];

const AccountMenu = ({ onLogout }) => {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [langAnchorEl, setLangAnchorEl] = useState(null);
  const [themeAnchorEl, setThemeAnchorEl] = useState(null);
  const navigate = useNavigate();
  const muiTheme = useMuiTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));
  const currentLang = LANGUAGES.find((language) => language.code === i18n.language) || LANGUAGES.at(0);
  const currentTheme = THEME_LIST.find((item) => item.id === theme) || THEME_LIST.at(0);

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

  const handleSelectLanguage = (langCode) => {
    i18n.changeLanguage(langCode);
    setLangAnchorEl(null);
  };

  const handleSelectTheme = (themeId) => {
    setTheme(themeId);
    setThemeAnchorEl(null);
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
            <ListItemButton onClick={(event) => setLangAnchorEl(event.currentTarget)}>
              <ListItemIcon sx={{ color: 'var(--accent-blue)', minWidth: 40 }}>
                <Language />
              </ListItemIcon>
              <ListItemText
                primary={t('nav.language')}
                secondary={currentLang.label}
                primaryTypographyProps={{
                  sx: { color: 'var(--text-primary)' }
                }}
                secondaryTypographyProps={{
                  sx: { color: 'var(--text-secondary)' }
                }}
              />
            </ListItemButton>
          </ListItem>

          <Menu
            anchorEl={langAnchorEl}
            open={Boolean(langAnchorEl)}
            onClose={() => setLangAnchorEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            {LANGUAGES.map((language) => (
              <MenuItem
                key={language.code}
                selected={language.code === currentLang.code}
                onClick={() => handleSelectLanguage(language.code)}
              >
                <strong>{language.short}</strong>&nbsp;— {language.label}
              </MenuItem>
            ))}
          </Menu>

          <ListItem disablePadding>
            <ListItemButton onClick={(event) => setThemeAnchorEl(event.currentTarget)}>
              <ListItemIcon sx={{ color: 'var(--accent-blue)', minWidth: 40 }}>
                {currentTheme.icon}
              </ListItemIcon>
              <ListItemText
                primary={t('nav.theme')}
                secondary={t(currentTheme.labelKey)}
                primaryTypographyProps={{
                  sx: { color: 'var(--text-primary)' }
                }}
                secondaryTypographyProps={{
                  sx: { color: 'var(--text-secondary)' }
                }}
              />
            </ListItemButton>
          </ListItem>

          <Menu
            anchorEl={themeAnchorEl}
            open={Boolean(themeAnchorEl)}
            onClose={() => setThemeAnchorEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            {THEME_LIST.map((item) => (
              <MenuItem
                key={item.id}
                selected={item.id === currentTheme.id}
                onClick={() => handleSelectTheme(item.id)}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                  {item.icon}
                  <span>{t(item.labelKey)}</span>
                </Box>
              </MenuItem>
            ))}
          </Menu>

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
