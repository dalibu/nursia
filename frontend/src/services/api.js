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

api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const auth = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
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
  getUserInfo: () => api.get('/auth/me'),
};

export const recipients = {
  list: () => api.get('/recipients/'),
};

export const currencies = {
  list: () => api.get('/currencies/'),
  getAll: () => api.get('/currencies/all'),
  create: (data) => api.post('/currencies/', data),
  update: (id, data) => api.put(`/currencies/${id}`, data),
  delete: (id) => api.delete(`/currencies/${id}`)
};

export default api;