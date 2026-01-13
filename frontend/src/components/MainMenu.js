import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconButton, Tooltip } from '@mui/material';
import { Settings } from '@mui/icons-material';
import '../styles/MainMenu.css';

const MainMenu = ({ isAdmin, hasRequests, onLogout }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();

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
      <Tooltip title="Настройки">
        <IconButton 
          className="main-menu-trigger"
          onClick={toggleMenu}
          sx={{ color: 'var(--icon-color)' }}
        >
          <Settings />
        </IconButton>
      </Tooltip>
      
      {isMenuOpen && (
        <>
          <div className="main-menu-overlay" onClick={closeMenu}></div>
          <div className="main-menu">
            <div className="main-menu-header">
              <h3>Настройки</h3>
              <button className="main-menu-close" onClick={closeMenu}>
                ✕
              </button>
            </div>
            
            <div className="main-menu-body">
              {/* Админские разделы */}
              {isAdmin && (
                <div className="main-menu-section">
                  <h4>Администрирование</h4>
                  <Link to="/users" className="main-menu-item" onClick={closeMenu}>
                    <span className="menu-icon">👥</span>
                    Пользователи
                  </Link>
                  <Link to="/roles" className="main-menu-item" onClick={closeMenu}>
                    <span className="menu-icon">🔐</span>
                    Роли и права
                  </Link>
                  <Link to="/requests" className="main-menu-item" onClick={closeMenu}>
                    <span className="menu-icon">📋</span>
                    Заявки {hasRequests && <span className="menu-badge">⚠️</span>}
                  </Link>
                  <Link to="/categories" className="main-menu-item" onClick={closeMenu}>
                    <span className="menu-icon">📁</span>
                    Категории
                  </Link>
                  <Link to="/employment" className="main-menu-item" onClick={closeMenu}>
                    <span className="menu-icon">👔</span>
                    Трудовые отношения
                  </Link>
                  <Link to="/currencies" className="main-menu-item" onClick={closeMenu}>
                    <span className="menu-icon">💰</span>
                    Валюты
                  </Link>
                  <Link to="/settings" className="main-menu-item" onClick={closeMenu}>
                    <span className="menu-icon">⚙️</span>
                    Параметры
                  </Link>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MainMenu;
