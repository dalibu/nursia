import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconButton, Tooltip, Button, Menu, MenuItem } from '@mui/material';
import { Home, Payment, AccessTime, LightMode, DarkMode, Language } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { useNotifications } from './Layout';
import MainMenu from './MainMenu';
import AccountMenu from './AccountMenu';

const LANGUAGES = [
  { code: 'uk', short: 'UA', label: 'Українська' },
  { code: 'ru', short: 'RU', label: 'Русский' },
  { code: 'de', short: 'DE', label: 'Deutsch' },
  { code: 'en', short: 'EN', label: 'English' },
];

function PageHeader({ title = 'NURSIA', showMainMenu = true }) {
  const { theme, toggleTheme } = useTheme();
  const { handleLogout, isAdmin, hasRequests } = useNotifications();
  const { t, i18n } = useTranslation();

  // Состояние для открытия/закрытия выпадающего меню языков
  const [langAnchorEl, setLangAnchorEl] = useState(null);
  const openLangMenu = Boolean(langAnchorEl);

  const handleOpenLangMenu = (event) => {
    setLangAnchorEl(event.currentTarget);
  };

  const handleCloseLangMenu = () => {
    setLangAnchorEl(null);
  };

  const handleSelectLanguage = (langCode) => {
    i18n.changeLanguage(langCode);
    handleCloseLangMenu();
  };

  // Определяем текущий выбранный язык для отображения на кнопке (по умолчанию UA)
  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) || { code: 'uk', short: 'UA', label: 'Українська' };

  return (
    <div className="nursia-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <h1 className="nursia-title">
          <img src="/favicon.svg" alt="Nursia" width="40" height="40" />
          {title}
        </h1>
      </div>

      <div className="nursia-header-actions">
        <Tooltip title={t('nav.home')}>
          <IconButton component={Link} to="/">
            <Home />
          </IconButton>
        </Tooltip>

        <Tooltip title={t('nav.payments')}>
          <IconButton component={Link} to="/payments">
            <Payment />
          </IconButton>
        </Tooltip>

        <Tooltip title={t('nav.timeTracker')}>
          <IconButton component={Link} to="/time-tracker">
            <AccessTime />
          </IconButton>
        </Tooltip>

        {showMainMenu && <MainMenu isAdmin={isAdmin} hasRequests={hasRequests} />}
        <AccountMenu onLogout={handleLogout} />

        {/* Кнопка выбора языка (UA / RU / DE / EN) */}
        <Tooltip title={t('nav.language')}>
          <Button
            size="small"
            onClick={handleOpenLangMenu}
            startIcon={<Language />}
            sx={{
              color: 'inherit',
              minWidth: 'auto',
              fontWeight: 600,
              textTransform: 'none',
            }}
          >
            {currentLang.short}
          </Button>
        </Tooltip>

        <Menu
          anchorEl={langAnchorEl}
          open={openLangMenu}
          onClose={handleCloseLangMenu}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {LANGUAGES.map((lang) => (
            <MenuItem
              key={lang.code}
              selected={lang.code === currentLang.code}
              onClick={() => handleSelectLanguage(lang.code)}
            >
              <strong>{lang.short}</strong>&nbsp;— {lang.label}
            </MenuItem>
          ))}
        </Menu>

        {/* Переключатель темы */}
        <Tooltip title={theme === 'dark' ? t('nav.lightTheme') : t('nav.darkTheme')}>
          <IconButton onClick={toggleTheme}>
            {theme === 'dark' ? <LightMode /> : <DarkMode />}
          </IconButton>
        </Tooltip>
      </div>
    </div>
  );
}

export default PageHeader;
