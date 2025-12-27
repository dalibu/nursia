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

export const contributors = {
  list: () => api.get('/contributors/'),
  listAdmin: () => api.get('/contributors/admin'),
  create: (data) => api.post('/contributors/', data),
  update: (id, data) => api.put(`/contributors/${id}`, data),
  delete: (id) => api.delete(`/contributors/${id}`),
  validateDelete: (id) => api.get(`/contributors/${id}/validate-delete`),
};

export const currencies = {
  list: () => api.get('/currencies/'),
  getAll: () => api.get('/currencies/all'),
  create: (data) => api.post('/currencies/', data),
  update: (id, data) => api.put(`/currencies/${id}`, data),
  delete: (id) => api.delete(`/currencies/${id}`)
};

export const workSessions = {
  start: (data) => api.post('/work-sessions/start', data),
  stop: (id) => api.post(`/work-sessions/${id}/stop`),
  pause: (id) => api.post(`/work-sessions/${id}/pause`),
  resume: (id) => api.post(`/work-sessions/${id}/resume`),
  list: (params) => api.get('/work-sessions/', { params }),
  getGrouped: (params) => api.get('/work-sessions/grouped', { params }),
  getActive: () => api.get('/work-sessions/active'),
  getSummary: (params) => api.get('/work-sessions/summary', { params })
};

export const employment = {
  list: (params) => api.get('/employment/', { params }),
  create: (data) => api.post('/employment/', data),
  update: (id, data) => api.put(`/employment/${id}`, data),
  delete: (id) => api.delete(`/employment/${id}`)
};

export const balances = {
  getSummary: (params) => api.get('/balances/summary', { params }),
  getMonthly: (params) => api.get('/balances/monthly', { params })
};

export default api;