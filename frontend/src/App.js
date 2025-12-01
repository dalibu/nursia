import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Layout from './components/Layout';
import ExpensesPage from './pages/ExpensesPage';
import CategoriesPage from './pages/CategoriesPage';
import CurrenciesPage from './pages/CurrenciesPage';
import ReportsPage from './pages/ReportsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AdminPage from './pages/AdminPage';
import ProfilePage from './pages/ProfilePage';
import UsersPage from './pages/UsersPage';

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
      <Router>
        <Routes>
          <Route path="/login" element={
            isAuthenticated ? <Navigate to="/" replace /> : <LoginPage onLogin={() => setIsAuthenticated(true)} />
          } />
          <Route path="/register" element={
            isAuthenticated ? <Navigate to="/" replace /> : <RegisterPage />
          } />
          <Route path="/" element={
            isAuthenticated ? <Layout onLogout={() => setIsAuthenticated(false)} /> : <Navigate to="/login" replace />
          }>
            <Route index element={<ExpensesPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="currencies" element={<CurrenciesPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;