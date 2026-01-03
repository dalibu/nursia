import axios from 'axios';

// Determine API base URL
// In development on localhost, connect to localhost:8000
// In production, use relative URL (same host as frontend)
const getApiBaseUrl = () => {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8000/api';
  }
  // For production or other environments, use relative URL
  return '/api';
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  response => response,  // Успешные ответы просто пропускаем
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      // Не делаем редирект, если мы и так на странице входа, чтобы не сбрасывать ошибки
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const auth = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  changePassword: (data) => api.post('/auth/change-password', data),
  me: () => api.get('/auth/me'),
};

export const users = {
  listAll: () => api.get('/users/all'),
};

export const payments = {
  list: (params) => api.get('/payments/', { params }),
  create: (data) => api.post('/payments/', data),
  update: (id, data) => api.put(`/payments/${id}`, data),
  delete: (id) => api.delete(`/payments/${id}`),
  reports: (params) => api.get('/payments/reports', { params }),
  categories: () => api.get('/payments/categories'),
  createCategory: (data) => api.post('/payments/categories', data),
  updateCategory: (id, data) => api.put(`/payments/categories/${id}`, data),
  deleteCategory: (id) => api.delete(`/payments/categories/${id}`),
  // Category groups
  groups: () => api.get('/payments/groups'),
  createGroup: (data) => api.post('/payments/groups', data),
  updateGroup: (id, data) => api.put(`/payments/groups/${id}`, data),
  deleteGroup: (id) => api.delete(`/payments/groups/${id}`),
  getUserInfo: () => api.get('/auth/me'),
};

// New users API for RBAC
export const usersApi = {
  list: () => api.get('/users/'),
  create: (data) => api.post('/admin/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
};

export const currencies = {
  list: () => api.get('/currencies/'),
  getAll: () => api.get('/currencies/all'),
  create: (data) => api.post('/currencies/', data),
  update: (id, data) => api.put(`/currencies/${id}`, data),
  delete: (id) => api.delete(`/currencies/${id}`)
};

export const assignments = {
  start: (data) => api.post('/assignments/start', data),
  stop: (id) => api.post(`/assignments/${id}/stop`),
  pause: (id) => api.post(`/assignments/${id}/pause`),
  resume: (id) => api.post(`/assignments/${id}/resume`),
  switchTask: (id, data) => api.post(`/assignments/${id}/switch-task`, data),
  list: (params) => api.get('/assignments/', { params }),
  getGrouped: (params) => api.get('/assignments/grouped', { params }),
  getActive: () => api.get('/assignments/active'),
  getSummary: (params) => api.get('/assignments/summary', { params })
};

export const employment = {
  list: (params) => api.get('/employment/', { params }),
  create: (data) => api.post('/employment/', data),
  update: (id, data) => api.put(`/employment/${id}`, data),
  delete: (id) => api.delete(`/employment/${id}`)
};

export const balances = {
  getSummary: (params) => api.get('/balances/summary', { params }),
  getMonthly: (params) => api.get('/balances/monthly', { params }),
  getMutual: (params) => api.get('/balances/mutual', { params }),
  getDebug: (params) => api.get('/balances/debug', { params })
};

export const settings = {
  getDebug: () => api.get('/settings/debug')
};

export default api;