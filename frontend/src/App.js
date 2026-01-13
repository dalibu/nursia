import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import 'dayjs/locale/ru';
import { ActiveSessionProvider } from './context/ActiveSessionContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { ThemeProvider as CustomThemeProvider, useTheme as useCustomTheme } from './contexts/ThemeContext';
import './styles/theme.css';
import Layout from './components/Layout';
import PaymentsPage from './pages/PaymentsPage';
import CategoriesPage from './pages/CategoriesPage';
import CurrenciesPage from './pages/CurrenciesPage';
import ReportsPage from './pages/ReportsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import DashboardPage from './pages/DashboardPage';
import TimeTrackerPage from './pages/TimeTrackerPage';
import EmploymentPage from './pages/EmploymentPage';

import ProfilePage from './pages/ProfilePage';
import UsersPage from './pages/UsersPage';
import SettingsPage from './pages/SettingsPage';
import RequestsPage from './pages/RequestsPage';
import RolesPage from './pages/RolesPage';

// Wrapper component to use custom theme
function ThemedApp() {
  const { theme: customTheme } = useCustomTheme();
  
  const muiTheme = createTheme({
    palette: {
      mode: customTheme === 'dark' ? 'dark' : 'light',
      primary: { main: customTheme === 'dark' ? '#3b82f6' : '#2563eb' },
      secondary: { main: customTheme === 'dark' ? '#10b981' : '#059669' },
      background: {
        default: customTheme === 'dark' ? '#0f172a' : '#f1f5f9',
        paper: customTheme === 'dark' ? '#1e293b' : '#ffffff',
      },
      text: {
        primary: customTheme === 'dark' ? '#e2e8f0' : '#1e293b',
        secondary: customTheme === 'dark' ? '#94a3b8' : '#64748b',
      },
    },
    components: {
      MuiIconButton: {
        styleOverrides: {
          root: {
            color: customTheme === 'dark' ? '#e2e8f0' : '#475569',
          },
        },
      },
    },
  });

  return (
    <ThemeProvider theme={muiTheme}>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return null; // или компонент загрузки
  }

  return (
    <>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="ru">
        <Router>
          <Routes>
            <Route path="/login" element={
              isAuthenticated ? <Navigate to="/" replace /> : <LoginPage onLogin={() => setIsAuthenticated(true)} />
            } />
            <Route path="/register" element={
              isAuthenticated ? <Navigate to="/" replace /> : <RegisterPage />
            } />
            <Route path="/" element={
              isAuthenticated ? (
                <WebSocketProvider>
                  <ActiveSessionProvider>
                    <Layout onLogout={() => setIsAuthenticated(false)} />
                  </ActiveSessionProvider>
                </WebSocketProvider>
              ) : <Navigate to="/login" replace />
            }>
              <Route index element={<DashboardPage />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="time-tracker" element={<TimeTrackerPage />} />
              <Route path="employment" element={<EmploymentPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="currencies" element={<CurrenciesPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="requests" element={<RequestsPage />} />
              <Route path="roles" element={<RolesPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="change-password" element={<ChangePasswordPage />} />
            </Route>
          </Routes>
        </Router>
      </LocalizationProvider>
    </>
  );
}

export default function App() {
  return (
    <CustomThemeProvider>
      <ThemedApp />
    </CustomThemeProvider>
  );
}