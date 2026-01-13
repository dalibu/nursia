import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconButton, Tooltip } from '@mui/material';
import { Home, AccessTime, Payment } from '@mui/icons-material';
import { Link } from 'react-router-dom';
import MainMenu from './MainMenu';
import AccountMenu from './AccountMenu';
import axios from 'axios';
import '../styles/pages.css';

const PageWrapper = ({ children, title, actions }) => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasRequests, setHasRequests] = useState(false);

  useEffect(() => {
    checkUserRole();
  }, []);

  const checkUserRole = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const roles = response.data.roles || [];
      setIsAdmin(roles.includes('admin'));
    } catch (error) {
      console.error('Failed to get user info:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <div className="page-container">
      {/* Header */}
      <header className="page-header">
        <h1 className="page-title">
          <img src="/favicon.svg" alt="Nursia" width="40" height="40" />
          {title || 'NURSIA'}
        </h1>
        <div className="page-header-actions">
          <Tooltip title="Обозрение">
            <IconButton className="btn btn-secondary" component={Link} to="/">
              <Home />
            </IconButton>
          </Tooltip>
          <Tooltip title="Платежи">
            <IconButton className="btn btn-secondary" component={Link} to="/payments">
              <Payment />
            </IconButton>
          </Tooltip>
          <Tooltip title="Время">
            <IconButton className="btn btn-secondary" component={Link} to="/time-tracker">
              <AccessTime />
            </IconButton>
          </Tooltip>
          {actions}
          {isAdmin && (
            <MainMenu 
              isAdmin={isAdmin} 
              hasRequests={hasRequests}
              onLogout={handleLogout}
            />
          )}
          <AccountMenu onLogout={handleLogout} />
        </div>
      </header>

      {/* Content */}
      {children}
    </div>
  );
};

export default PageWrapper;
