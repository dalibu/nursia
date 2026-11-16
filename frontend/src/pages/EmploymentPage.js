import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Typography, Paper, Box, Button,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
    IconButton, Chip, CircularProgress, Alert, Snackbar
} from '@mui/material';
import { Add, Edit, Delete, Work, Person, AttachMoney } from '@mui/icons-material';
import { employment, users, currencies } from '../services/api';

const currencySymbols = {
    'UAH': '₴',
    'EUR': '€',
    'USD': '$'
};

function EmploymentPage() {
    const { t, i18n } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [relations, setRelations] = useState([]);
    const [usersList, setUsersList] = useState([]);
    const [currencyList, setCurrencyList] = useState(['UAH', 'EUR', 'USD']);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({
        user_id: '',
        hourly_rate: '',
        currency: 'UAH',
        is_active: true
    });
    const [error, setError] = useState('');

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
                employment.list({ is_active: null }),
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
        if (!formData.user_id || !formData.hourly_rate) {
            setError(t('employment.fillRequiredFields'));
            return;
        }

        try {
            if (editingId) {
                await employment.update(editingId, {
                    hourly_rate: parseFloat(formData.hourly_rate),
                    currency: formData.currency,
                    is_active: formData.is_active
                });
                showSuccess(t('employment.updatedMessage'));
            } else {
                await employment.create({
                    user_id: parseInt(formData.user_id, 10),
                    hourly_rate: parseFloat(formData.hourly_rate),
                    currency: formData.currency
                });
                showSuccess(t('employment.createdMessage'));
            }
            handleCloseDialog();
            loadData();
        } catch (error) {
            setError(error.response?.data?.detail || t('roles.saveError'));
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm(t('employment.confirmDeactivate'))) return;

        try {
            await employment.delete(id);
            showSuccess(t('employment.deactivatedMessage'));
            loadData();
        } catch (error) {
            showError(error.response?.data?.detail || t('roles.deleteError'));
        }
    };

    const currentLocale = i18n.language === 'uk' ? 'uk-UA' : i18n.language || 'uk-UA';

    const formatCurrency = (amount, currency = 'UAH') => {
        const symbol = currencySymbols[currency] || currency;
        return `${symbol}${Number(amount).toLocaleString(currentLocale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    };

    const availableUsers = usersList.filter(user => {
        const isAdmin = user.roles?.includes('admin') || user.role === 'admin';
        if (isAdmin) return false;

        if (editingId) {
            const currentRelation = relations.find(r => r.id === editingId);
            if (currentRelation && currentRelation.user_id === user.id) return true;
        }
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
                <Typography variant="h6">
                    👔 {t('employment.pageTitle')}
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={() => handleOpenDialog()}
                >
                    {t('employment.add')}
                </Button>
            </Box>

            {relations.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <Work sx={{ fontSize: 60, color: 'grey.400', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary">
                        {t('employment.noRelations')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {t('employment.noRelationsHint')}
                    </Typography>
                    <Button variant="contained" startIcon={<Add />} onClick={() => handleOpenDialog()}>
                        {t('employment.createFirst')}
                    </Button>
                </Paper>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell><strong>{t('dashboard.worker')}</strong></TableCell>
                                <TableCell align="right"><strong>{t('employment.ratePerHour')}</strong></TableCell>
                                <TableCell align="center"><strong>{t('common.status')}</strong></TableCell>
                                <TableCell align="center"><strong>{t('common.actions')}</strong></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {relations.map((rel) => (
                                <TableRow
                                    key={rel.id}
                                    hover
                                    sx={{ opacity: rel.is_active ? 1 : 0.5 }}
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
                                            label={`${formatCurrency(rel.hourly_rate, rel.currency)}/${t('employment.hourShort')}`}
                                            color="success"
                                            variant="outlined"
                                        />
                                    </TableCell>
                                    <TableCell align="center">
                                        {rel.is_active ? (
                                            <Chip label={t('employment.active')} color="success" size="small" />
                                        ) : (
                                            <Chip label={t('employment.inactive')} color="default" size="small" />
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
                    {editingId ? t('employment.editRelation') : t('employment.newRelation')}
                </DialogTitle>
                <DialogContent>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
                    )}

                    <TextField
                        select
                        fullWidth
                        label={t('dashboard.worker')}
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
                            label={t('employment.hourlyRate')}
                            type="number"
                            value={formData.hourly_rate}
                            onChange={(e) => setFormData({ ...formData, hourly_rate: e.target.value })}
                            inputProps={{ min: 0, step: 0.01 }}
                        />
                        <TextField
                            select
                            label={t('payments.currency')}
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
                            label={t('common.status')}
                            value={formData.is_active}
                            onChange={(e) => setFormData({ ...formData, is_active: e.target.value })}
                            sx={{ mt: 2 }}
                        >
                            <MenuItem value={true}>{t('employment.active')}</MenuItem>
                            <MenuItem value={false}>{t('employment.inactive')}</MenuItem>
                        </TextField>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>{t('common.cancel')}</Button>
                    <Button variant="contained" onClick={handleSave}>
                        {editingId ? t('common.save') : t('common.create')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar */}
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
