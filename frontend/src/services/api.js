import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const auth = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
};

export const expenses = {
  list: (params) => api.get('/expenses/', { params }),
  create: (data) => api.post('/expenses/', data),
  update: (id, data) => api.put(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
  reports: (params) => api.get('/expenses/reports', { params }),
  categories: () => api.get('/expenses/categories'),
  getUserInfo: () => api.get('/auth/me'),
};

export const recipients = {
  list: () => api.get('/recipients/'),
};

export const currencies = {
  list: () => api.get('/currencies/'),
};

export default api;