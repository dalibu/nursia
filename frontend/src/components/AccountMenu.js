import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconButton, Tooltip } from '@mui/material';
import { AccountCircle } from '@mui/icons-material';
import { useTheme } from '../contexts/ThemeContext';
import '../styles/MainMenu.css';

const AccountMenu = ({ onLogout }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

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
    <div className="main-menu-container">
      <Tooltip title="Аккаунт">
        <IconButton 
          className="main-menu-trigger nursia-btn nursia-btn-secondary"
          onClick={toggleMenu}
        >
          <AccountCircle />
        </IconButton>
      </Tooltip>
      
      {isMenuOpen && (
        <>
          <div className="main-menu-overlay" onClick={closeMenu}></div>
          <div className="main-menu">
            <div className="main-menu-header">
              <h3>Аккаунт</h3>
              <button className="main-menu-close" onClick={closeMenu}>
                ✕
              </button>
            </div>
            
            <div className="main-menu-body">
              <div className="main-menu-section">
                <Link to="/profile" className="main-menu-item" onClick={closeMenu}>
                  <span className="menu-icon">👤</span>
                  Профиль
                </Link>
                <button className="main-menu-item" onClick={toggleTheme}>
                  <span className="menu-icon">{theme === 'dark' ? '☀️' : '🌙'}</span>
                  {theme === 'dark' ? 'Светлая тема' : 'Темная тема'}
                </button>
                <button className="main-menu-item logout-btn" onClick={handleLogout}>
                  <span className="menu-icon">🚪</span>
                  Выйти
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AccountMenu;
