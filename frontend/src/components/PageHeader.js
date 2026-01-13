import React from 'react';
import { Link } from 'react-router-dom';
import { IconButton, Tooltip } from '@mui/material';
import { Home, Payment, AccessTime, LightMode, DarkMode } from '@mui/icons-material';
import { useTheme } from '../contexts/ThemeContext';
import { useNotifications } from './Layout';
import MainMenu from './MainMenu';
import AccountMenu from './AccountMenu';

function PageHeader({ title = 'NURSIA', showMainMenu = false }) {
    const { theme, toggleTheme } = useTheme();
    const { handleLogout } = useNotifications();

    return (
        <div className="nursia-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h1 className="nursia-title">
                    <img src="/favicon.svg" alt="Nursia" width="40" height="40" />
                    NURSIA
                </h1>
            </div>
            <div className="nursia-header-actions">
                <Tooltip title="Главная">
                    <IconButton component={Link} to="/">
                        <Home />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Платежи">
                    <IconButton component={Link} to="/payments">
                        <Payment />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Учёт времени">
                    <IconButton component={Link} to="/time-tracker">
                        <AccessTime />
                    </IconButton>
                </Tooltip>
                {showMainMenu && <MainMenu isAdmin={true} />}
                <AccountMenu onLogout={handleLogout} />
                <Tooltip title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
                    <IconButton onClick={toggleTheme}>
                        {theme === 'dark' ? <LightMode /> : <DarkMode />}
                    </IconButton>
                </Tooltip>
            </div>
        </div>
    );
}

export default PageHeader;
