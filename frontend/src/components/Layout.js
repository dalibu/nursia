import React, { useState, useEffect, createContext, useContext } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Container, Box } from '@mui/material';
import axios from 'axios';
import useIdleTimer from '../hooks/useIdleTimer';
import FloatingTimer from './FloatingTimer';
import PageHeader from './PageHeader';
import WorkspaceSwitcher from './WorkspaceSwitcher';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

function Layout({ onLogout }) {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [hasRequests, setHasRequests] = useState(false);
  const [checkInterval, setCheckInterval] = useState(30);

  useEffect(() => {
    checkUserRole();
  }, []);

  useEffect(() => {
    if (isSystemAdmin) {
      loadCheckInterval();
      checkRequests();
    }
  }, [isSystemAdmin]);

  useEffect(() => {
    if (isSystemAdmin && checkInterval) {
      const intervalMs = checkInterval * 60 * 1000;
      const interval = setInterval(checkRequests, intervalMs);
      return () => clearInterval(interval);
    }
  }, [isSystemAdmin, checkInterval]);

  const checkUserRole = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const roles = response.data.roles || [];
      setIsAdmin(roles.includes('admin'));
      const isSystemAdminUser = (response.data.system_roles || []).includes('admin');
      setIsSystemAdmin(isSystemAdminUser);
      if (response.data.profile_setup_pending && window.location.pathname !== '/profile') {
        navigate('/profile');
      }
      if (isSystemAdminUser) {
        checkRequests();
      }
    } catch (error) {
      console.error('Failed to get user info:', error);
    }
  };

  const loadCheckInterval = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/settings/requests_check_interval', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCheckInterval(parseInt(response.data.value));
    } catch (error) {
      console.error('Failed to load check interval:', error);
    }
  };

  const checkRequests = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/admin/registration-requests', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const pendingRequests = response.data.filter(r => r.status === 'pending');
      setHasRequests(pendingRequests.length > 0);
    } catch (error) {
      console.error('Failed to check requests:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    onLogout();
    navigate('/login');
  };

  useIdleTimer(handleLogout, 30 * 60 * 1000);

  return (
    <NotificationContext.Provider value={{ checkRequests, handleLogout, isAdmin, isSystemAdmin, hasRequests }}>
      <FloatingTimer />
      <Box sx={{ flexGrow: 1 }}>
        <Container maxWidth="lg" sx={{ mt: 4 }}>
          <WorkspaceSwitcher />
          <PageHeader isAdmin={isAdmin} hasRequests={hasRequests} />
          <Outlet />
        </Container>
      </Box>
    </NotificationContext.Provider>
  );
}

export default Layout;