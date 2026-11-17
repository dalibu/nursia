import React from 'react';
import { Link } from 'react-router-dom';
import { IconButton, Tooltip } from '@mui/material';
import { Home, Payment, AccessTime } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNotifications } from './Layout';
import MainMenu from './MainMenu';
import AccountMenu from './AccountMenu';

function PageHeader({ title = 'NURSIA', showMainMenu = true }) {
  const { handleLogout, isAdmin, isSystemAdmin, hasRequests } = useNotifications();
  const { t } = useTranslation();

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

        {showMainMenu && (
          <MainMenu isAdmin={isAdmin} isSystemAdmin={isSystemAdmin} hasRequests={hasRequests} />
        )}
        <AccountMenu onLogout={handleLogout} />
      </div>
    </div>
  );
}

export default PageHeader;
