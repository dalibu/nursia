import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import 'dayjs/locale/ru';
import { ActiveSessionProvider } from './context/ActiveSessionContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
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

const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
    secondary: { main: '#dc004e' }
  }
});

function App() {
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
    <ThemeProvider theme={theme}>
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
              <Route path="settings" element={<SettingsPage />} />
              <Route path="change-password" element={<ChangePasswordPage />} />
            </Route>
          </Routes>
        </Router>
      </LocalizationProvider>
    </ThemeProvider>
  );
}

export default App;