import React, { useState, useEffect, useCallback } from 'react';
import {
    Typography, Paper, Box, Card, CardContent, Grid,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField, MenuItem, CircularProgress, Chip, Button, Tooltip
} from '@mui/material';
import {
    TrendingUp, AccessTime, Payment, AccountBalance,
    AttachMoney, CardGiftcard, ShoppingCart, SwapHoriz, Download
} from '@mui/icons-material';
import { balances, payments } from '../services/api';
import { useWebSocket } from '../contexts/WebSocketContext';

// Символы валют
const currencySymbols = {
    'UAH': '₴',
    'EUR': '€',
    'USD': '$'
};

function DashboardPage() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState(null);
    const [monthly, setMonthly] = useState([]);
    const [mutual, setMutual] = useState([]);
    const [months, setMonths] = useState(6);
    const [exporting, setExporting] = useState(false);

    const { subscribe } = useWebSocket();

    const handleExportJSON = async () => {
        setExporting(true);
        try {
            const response = await balances.getDebug({ months });
            const jsonStr = JSON.stringify(response.data, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dashboard_export_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export failed:', error);
        } finally {
            setExporting(false);
        }
    };

    const loadData = useCallback(async (showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            const [summaryRes, monthlyRes, mutualRes, userRes] = await Promise.all([
                balances.getSummary({}),
                balances.getMonthly({ months }),
                balances.getMutual({}),
                payments.getUserInfo()
            ]);
            setSummary(summaryRes.data);
            setMonthly(monthlyRes.data);
            setMutual(mutualRes.data);
            setUser(userRes.data);
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
        } finally {
            if (showLoading) setLoading(false);
        }
    }, [months]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Subscribe to WebSocket events for real-time updates (silent refresh)
    useEffect(() => {
        const unsubscribe = subscribe(
            ['payment_created', 'payment_updated', 'payment_deleted', 'assignment_started', 'assignment_stopped'],
            (event) => {
                console.log('[Dashboard] WebSocket event received:', event.type);
                // Silent reload - no loading spinner
                loadData(false);
            }
        );
        return () => unsubscribe();
    }, [subscribe, loadData]);

    const formatCurrency = (amount, currency = 'UAH', showAbsolute = false, hideZero = false) => {
        const value = showAbsolute ? Math.abs(Number(amount)) : Number(amount);
        if (hideZero && value === 0) return '';
        const symbol = currencySymbols[currency] || currency;
        return `${symbol}${value.toLocaleString('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h4" sx={{ fontWeight: 600, color: '#1a237e' }}>
                    Обозрение
                </Typography>
                {user?.roles?.includes('admin') && (
                    <Tooltip title="Экспорт всех данных в JSON">
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={exporting ? <CircularProgress size={16} /> : <Download />}
                            onClick={handleExportJSON}
                            disabled={exporting}
                        >
                            Экспорт JSON
                        </Button>
                    </Tooltip>
                )}
            </Box>

            {/* Summary Cards - 7 cards in one row */}
            <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
                {/* Зарплата */}
                <Box sx={{ flex: { xs: '1 1 45%', md: 1 } }}>
                    <Card sx={{
                        background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                        color: 'white',
                        height: '100%'
                    }}>
                        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption">Зарплата</Typography>
                            <Typography variant="h5" sx={{ fontWeight: 700 }}>
                                {formatCurrency(summary?.total_salary || 0, summary?.currency)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Box>

                {/* Расходы */}
                <Box sx={{ flex: { xs: '1 1 45%', md: 1 } }}>
                    <Card sx={{
                        background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                        color: 'white',
                        height: '100%'
                    }}>
                        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption">Расходы</Typography>
                            <Typography variant="h5" sx={{ fontWeight: 700 }}>
                                {formatCurrency(summary?.total_expenses || 0, summary?.currency)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Box>

                {/* Кредиты */}
                <Box sx={{ flex: { xs: '1 1 45%', md: 1 } }}>
                    <Card sx={{
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white',
                        height: '100%'
                    }}>
                        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption">Кредиты</Typography>
                            <Typography variant="h5" sx={{ fontWeight: 700 }}>
                                {formatCurrency(summary?.total_credits || 0, summary?.currency)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Box>

                {/* Погашения (orange) */}
                <Box sx={{ flex: { xs: '1 1 45%', md: 1 } }}>
                    <Card sx={{
                        background: 'linear-gradient(135deg, #f5af19 0%, #f12711 100%)',
                        color: 'white',
                        height: '100%'
                    }}>
                        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption">Погашения</Typography>
                            <Typography variant="h5" sx={{ fontWeight: 700 }}>
                                {formatCurrency(summary?.total_repayment ? -summary.total_repayment : 0, summary?.currency)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Box>

                {/* К оплате */}
                <Box sx={{ flex: { xs: '1 1 45%', md: 1 } }}>
                    <Card sx={{
                        background: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)',
                        color: 'white',
                        height: '100%'
                    }}>
                        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption">К оплате</Typography>
                            <Typography variant="h5" sx={{ fontWeight: 700 }}>
                                {formatCurrency(summary?.total_unpaid || 0, summary?.currency)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Box>

                {/* Премии (yellow) */}
                <Box sx={{ flex: { xs: '1 1 45%', md: 1 } }}>
                    <Card sx={{
                        background: 'linear-gradient(135deg, #f7dc6f 0%, #f1c40f 100%)',
                        color: 'white',
                        height: '100%'
                    }}>
                        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption">Премии</Typography>
                            <Typography variant="h5" sx={{ fontWeight: 700 }}>
                                {formatCurrency(summary?.total_bonus || 0, summary?.currency)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Box>

                {/* Всего */}
                <Box sx={{ flex: { xs: '1 1 45%', md: 1 } }}>
                    <Card sx={{
                        background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                        color: 'white',
                        height: '100%'
                    }}>
                        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption">Всего</Typography>
                            <Typography variant="h5" sx={{ fontWeight: 700 }}>
                                {formatCurrency(summary?.total || 0, summary?.currency)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Box>
            </Box>


            {/* Mutual Balances - Взаимные расчёты */}
            {mutual?.length > 0 && (
                <Paper sx={{ p: 3, mb: 4 }}>
                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SwapHoriz color="primary" /> Взаимные расчёты
                    </Typography>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                                    <TableCell><strong>Кредитор</strong></TableCell>
                                    <TableCell><strong>Должник</strong></TableCell>
                                    <TableCell align="right"><strong>Кредит/Аванс</strong></TableCell>
                                    <TableCell align="right"><strong>Погашено</strong></TableCell>
                                    <TableCell align="right"><strong>К оплате</strong></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {mutual.map((row, index) => (
                                    <TableRow key={index}>
                                        <TableCell>{row.creditor_name}</TableCell>
                                        <TableCell>{row.debtor_name}</TableCell>
                                        {/* Кредит/Аванс - фиолетовый */}
                                        <TableCell align="right">
                                            {row.credit > 0 && (
                                                <Chip
                                                    label={formatCurrency(row.credit, row.currency)}
                                                    sx={{ backgroundColor: '#764ba2', color: 'white' }}
                                                    size="small"
                                                />
                                            )}
                                        </TableCell>
                                        {/* Погашено - зелёный для положительных, красный для отрицательных */}
                                        <TableCell align="right">
                                            {row.offset !== 0 && (
                                                <Chip
                                                    label={formatCurrency(row.offset, row.currency)}
                                                    sx={{
                                                        backgroundColor: row.offset > 0 ? '#38ef7d' : '#ff6b6b',
                                                        color: row.offset > 0 ? '#1a1a1a' : 'white'
                                                    }}
                                                    size="small"
                                                />
                                            )}
                                        </TableCell>
                                        {/* К оплате - красный */}
                                        <TableCell align="right">
                                            {row.remaining > 0 && (
                                                <Chip
                                                    label={formatCurrency(row.remaining, row.currency)}
                                                    size="small"
                                                    sx={{ backgroundColor: '#ff4b2b', color: 'white' }}
                                                />
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}

            {/* Monthly Overview (Übersicht) */}
            <Paper sx={{ p: 3 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AccessTime color="primary" /> Помесячный обзор
                    </Typography>
                    <TextField
                        select
                        size="small"
                        value={months}
                        onChange={(e) => setMonths(e.target.value)}
                        sx={{ minWidth: 120 }}
                    >
                        <MenuItem value={3}>3 месяца</MenuItem>
                        <MenuItem value={6}>6 месяцев</MenuItem>
                        <MenuItem value={12}>12 месяцев</MenuItem>
                    </TextField>
                </Box>

                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                                <TableCell><strong>Период</strong></TableCell>
                                <TableCell align="center"><strong>Смены</strong></TableCell>
                                <TableCell align="right"><strong>Часы</strong></TableCell>
                                <TableCell align="right"><strong>Зарплата</strong></TableCell>
                                <TableCell align="right"><strong>Расходы</strong></TableCell>
                                <TableCell align="right"><strong>Кредиты</strong></TableCell>
                                <TableCell align="right"><strong>Погашено</strong></TableCell>
                                <TableCell align="right"><strong>К оплате</strong></TableCell>
                                <TableCell align="right"><strong>Премии</strong></TableCell>
                                <TableCell align="right"><strong>Итого</strong></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {monthly.map((row, index) => (
                                <TableRow
                                    key={index}
                                    sx={{ '&:hover': { backgroundColor: '#f9f9f9' } }}
                                >
                                    <TableCell>
                                        <strong>{row.period.split('-').reverse().join('.')}</strong>
                                    </TableCell>
                                    <TableCell align="center">{row.sessions || ''}</TableCell>
                                    <TableCell align="right">{row.hours ? row.hours.toFixed(1) : ''}</TableCell>
                                    {/* Зарплата - зелёный */}
                                    <TableCell align="right">
                                        {row.salary > 0 && (
                                            <Chip
                                                label={formatCurrency(row.salary, row.currency)}
                                                sx={{ backgroundColor: '#38ef7d', color: 'white' }}
                                                size="small"
                                            />
                                        )}
                                    </TableCell>
                                    {/* Расходы - розовый */}
                                    <TableCell align="right">
                                        {row.expenses > 0 && (
                                            <Chip
                                                label={formatCurrency(row.expenses, row.currency)}
                                                sx={{ backgroundColor: '#f093fb', color: 'white' }}
                                                size="small"
                                            />
                                        )}
                                    </TableCell>
                                    {/* Кредит - фиолетовый */}
                                    <TableCell align="right">
                                        {row.paid > 0 && (
                                            <Chip
                                                label={formatCurrency(row.paid, row.currency)}
                                                sx={{ backgroundColor: '#764ba2', color: 'white' }}
                                                size="small"
                                            />
                                        )}
                                    </TableCell>
                                    {/* Погашено - зелёный для положительных, красный для отрицательных */}
                                    <TableCell align="right">
                                        {row.offset !== 0 && (
                                            <Chip
                                                label={formatCurrency(row.offset, row.currency)}
                                                sx={{
                                                    backgroundColor: row.offset > 0 ? '#38ef7d' : '#ff6b6b',
                                                    color: row.offset > 0 ? '#1a1a1a' : 'white'
                                                }}
                                                size="small"
                                            />
                                        )}
                                    </TableCell>
                                    {/* Не выплачено - красный */}
                                    <TableCell align="right">
                                        {row.to_pay > 0 && (
                                            <Chip
                                                label={formatCurrency(row.to_pay, row.currency)}
                                                sx={{ backgroundColor: '#ff4b2b', color: 'white' }}
                                                size="small"
                                            />
                                        )}
                                    </TableCell>
                                    {/* Премия - оранжевый */}
                                    <TableCell align="right">
                                        {row.bonus > 0 && (
                                            <Chip
                                                icon={<CardGiftcard />}
                                                label={formatCurrency(row.bonus, row.currency)}
                                                sx={{ backgroundColor: '#FFD700', color: '#333' }}
                                                size="small"
                                            />
                                        )}
                                    </TableCell>
                                    {/* Итого - голубой */}
                                    <TableCell align="right">
                                        {row.total > 0 && (
                                            <Chip
                                                label={formatCurrency(row.total, row.currency)}
                                                sx={{ backgroundColor: '#00f2fe', color: '#333' }}
                                                size="small"
                                            />
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </Box>
    );
}

export default DashboardPage;
