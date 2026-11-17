import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { useTranslation } from 'react-i18next';
import 'dayjs/locale/uk';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import 'dayjs/locale/en';
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
  const { themeConfig } = useCustomTheme();
  const { t } = useTranslation();
  const p = themeConfig.palette;

  const muiTheme = createTheme({
    palette: {
      mode: themeConfig.mode,
      primary: { main: p.primary },
      secondary: { main: p.secondary },
      success: { main: p.success },
      warning: { main: p.warning },
      error: { main: p.error },
      info: { main: p.info },
      background: {
        default: p.bgDefault,
        paper: p.bgPaper,
      },
      text: {
        primary: p.textPrimary,
        secondary: p.textSecondary,
      },
    },
    components: {
      MuiIconButton: {
        styleOverrides: {
          root: {
            color: p.iconColor,
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            backgroundColor: p.tableHeaderBg,
            color: p.tableHeaderText,
            fontWeight: 700,
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&.deleted-row': {
              opacity: 0.65,
              backgroundColor: p.tableRowDeletedBg,
              '&.MuiTableRow-hover:hover': {
                backgroundColor: p.tableRowDeletedHoverBg,
              },
            },
          },
        },
      },
      MuiTablePagination: {
        defaultProps: {
          labelRowsPerPage: t('common.rowsPerPage'),
          labelDisplayedRows: ({ from, to, count }) => `${from}–${to} / ${count}`,
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
  const { i18n } = useTranslation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return null;
  }

  return (
    <>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={i18n.language || 'uk'}>
        <Router>
          <Routes>
            <Route path="/login" element={
              isAuthenticated ? <Navigate to="/" replace /> : <LoginPage onLogin={() => setIsAuthenticated(true)} />
            } />
            <Route path="/register" element={
              isAuthenticated ? <Navigate to="/profile" replace /> : <RegisterPage onLogin={() => setIsAuthenticated(true)} />
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
