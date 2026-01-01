import React, { useState, useEffect } from 'react';
import {
    Typography, Paper, Box, Button,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
    IconButton, Chip, CircularProgress, Alert, Snackbar
} from '@mui/material';
import {
    Add, Edit, Delete, Work, Person, AttachMoney
} from '@mui/icons-material';
import { employment, users, currencies } from '../services/api';

// Символы валют
const currencySymbols = {
    'UAH': '₴',
    'EUR': '€',
    'USD': '$'
};

function EmploymentPage() {
    const [loading, setLoading] = useState(true);
    const [relations, setRelations] = useState([]);
    const [usersList, setUsersList] = useState([]);
    const [currencyList, setCurrencyList] = useState(['UAH', 'EUR', 'USD']);

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({
        user_id: '',
        hourly_rate: '',
        currency: 'UAH',
        is_active: true
    });
    const [error, setError] = useState('');

    // Snackbar for notifications
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'error' });
    const showError = (message) => setSnackbar({ open: true, message, severity: 'error' });
    const showSuccess = (message) => setSnackbar({ open: true, message, severity: 'success' });
    const closeSnackbar = () => setSnackbar({ ...snackbar, open: false });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [relRes, usersRes, currRes] = await Promise.all([
                employment.list({ is_active: null }), // Все отношения
                users.listAll(),
                currencies.list().catch(() => ({ data: { currencies: ['UAH', 'EUR', 'USD'] } }))
            ]);
            setRelations(relRes.data);
            setUsersList(usersRes.data);
            if (currRes.data?.currencies) {
                setCurrencyList(currRes.data.currencies);
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDialog = (relation = null) => {
        if (relation) {
            setEditingId(relation.id);
            setFormData({
                user_id: relation.user_id,
                hourly_rate: relation.hourly_rate,
                currency: relation.currency,
                is_active: relation.is_active
            });
        } else {
            setEditingId(null);
            setFormData({
                user_id: '',
                hourly_rate: '',
                currency: 'UAH',
                is_active: true
            });
        }
        setError('');
        setDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setDialogOpen(false);
        setEditingId(null);
        setError('');
    };

    const handleSave = async () => {
        // Validation
        if (!formData.user_id || !formData.hourly_rate) {
            setError('Заполните все обязательные поля');
            return;
        }

        try {
            if (editingId) {
                await employment.update(editingId, {
                    hourly_rate: parseFloat(formData.hourly_rate),
                    currency: formData.currency,
                    is_active: formData.is_active
                });
                showSuccess('Трудовые отношения обновлены');
            } else {
                await employment.create({
                    user_id: parseInt(formData.user_id),
                    hourly_rate: parseFloat(formData.hourly_rate),
                    currency: formData.currency
                });
                showSuccess('Трудовые отношения созданы');
            }
            handleCloseDialog();
            loadData();
        } catch (error) {
            setError(error.response?.data?.detail || 'Ошибка сохранения');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Деактивировать трудовые отношения?')) return;

        try {
            await employment.delete(id);
            showSuccess('Трудовые отношения деактивированы');
            loadData();
        } catch (error) {
            showError(error.response?.data?.detail || 'Ошибка удаления');
        }
    };

    const formatCurrency = (amount, currency = 'UAH') => {
        const symbol = currencySymbols[currency] || currency;
        return `${symbol}${Number(amount).toLocaleString('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    };

    // Get users that are workers (not admins) and don't have active employment
    const availableUsers = usersList.filter(user => {
        // Exclude admins - only workers can have employment relations
        const isAdmin = user.roles?.includes('admin') || user.role === 'admin';
        if (isAdmin) return false;

        // If editing, include current user
        if (editingId) {
            const currentRelation = relations.find(r => r.id === editingId);
            if (currentRelation && currentRelation.user_id === user.id) return true;
        }
        // Exclude users that already have active employment
        return !relations.some(r => r.user_id === user.id && r.is_active);
    });

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h4" sx={{ fontWeight: 600, color: '#1a237e' }}>
                    👔 Трудовые отношения
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={() => handleOpenDialog()}
                >
                    Добавить
                </Button>
            </Box>

            {relations.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <Work sx={{ fontSize: 60, color: 'grey.400', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary">
                        Нет трудовых отношений
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Создайте трудовые отношения для учёта рабочего времени
                    </Typography>
                    <Button variant="contained" startIcon={<Add />} onClick={() => handleOpenDialog()}>
                        Создать первое
                    </Button>
                </Paper>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                                <TableCell><strong>Работник</strong></TableCell>
                                <TableCell align="right"><strong>Ставка/час</strong></TableCell>
                                <TableCell align="center"><strong>Статус</strong></TableCell>
                                <TableCell align="center"><strong>Действия</strong></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {relations.map((rel) => (
                                <TableRow
                                    key={rel.id}
                                    sx={{
                                        '&:hover': { backgroundColor: '#f9f9f9' },
                                        opacity: rel.is_active ? 1 : 0.5
                                    }}
                                >
                                    <TableCell>
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <Person color="primary" />
                                            {rel.user_name || `User #${rel.user_id}`}
                                        </Box>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Chip
                                            icon={<AttachMoney />}
                                            label={`${formatCurrency(rel.hourly_rate, rel.currency)}/ч`}
                                            color="success"
                                            variant="outlined"
                                        />
                                    </TableCell>
                                    <TableCell align="center">
                                        {rel.is_active ? (
                                            <Chip label="Активно" color="success" size="small" />
                                        ) : (
                                            <Chip label="Неактивно" color="default" size="small" />
                                        )}
                                    </TableCell>
                                    <TableCell align="center">
                                        <IconButton
                                            color="primary"
                                            onClick={() => handleOpenDialog(rel)}
                                            size="small"
                                        >
                                            <Edit />
                                        </IconButton>
                                        {rel.is_active && (
                                            <IconButton
                                                color="error"
                                                onClick={() => handleDelete(rel.id)}
                                                size="small"
                                            >
                                                <Delete />
                                            </IconButton>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Create/Edit Dialog */}
            <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {editingId ? 'Редактировать отношения' : 'Новые трудовые отношения'}
                </DialogTitle>
                <DialogContent>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
                    )}

                    <TextField
                        select
                        fullWidth
                        label="Работник"
                        value={formData.user_id}
                        onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                        sx={{ mt: 2 }}
                        disabled={!!editingId}
                    >
                        {(editingId ? usersList : availableUsers).map((user) => (
                            <MenuItem key={user.id} value={user.id}>
                                {user.full_name || user.name} ({user.username})
                            </MenuItem>
                        ))}
                    </TextField>

                    <Box display="flex" gap={2} sx={{ mt: 2 }}>
                        <TextField
                            fullWidth
                            label="Ставка за час"
                            type="number"
                            value={formData.hourly_rate}
                            onChange={(e) => setFormData({ ...formData, hourly_rate: e.target.value })}
                            inputProps={{ min: 0, step: 0.01 }}
                        />
                        <TextField
                            select
                            label="Валюта"
                            value={formData.currency}
                            onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                            sx={{ minWidth: 100 }}
                        >
                            {currencyList.map((curr) => (
                                <MenuItem key={curr} value={curr}>
                                    {currencySymbols[curr] || curr}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Box>

                    {editingId && (
                        <TextField
                            select
                            fullWidth
                            label="Статус"
                            value={formData.is_active}
                            onChange={(e) => setFormData({ ...formData, is_active: e.target.value })}
                            sx={{ mt: 2 }}
                        >
                            <MenuItem value={true}>Активно</MenuItem>
                            <MenuItem value={false}>Неактивно</MenuItem>
                        </TextField>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Отмена</Button>
                    <Button variant="contained" onClick={handleSave}>
                        {editingId ? 'Сохранить' : 'Создать'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar for notifications */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={closeSnackbar}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert onClose={closeSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}

export default EmploymentPage;
