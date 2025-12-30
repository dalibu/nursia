import React, { useState, useEffect } from 'react';
import {
    Typography, Paper, Box, Card, CardContent, Grid,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField, MenuItem, CircularProgress, Chip
} from '@mui/material';
import {
    TrendingUp, AccessTime, Payment, AccountBalance,
    AttachMoney, CardGiftcard, ShoppingCart
} from '@mui/icons-material';
import { balances } from '../services/api';

// Символы валют
const currencySymbols = {
    'UAH': '₴',
    'EUR': '€',
    'USD': '$'
};

function DashboardPage() {
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState(null);
    const [monthly, setMonthly] = useState([]);
    const [months, setMonths] = useState(6);

    useEffect(() => {
        loadData();
    }, [months]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [summaryRes, monthlyRes] = await Promise.all([
                balances.getSummary({}),
                balances.getMonthly({ months })
            ]);
            setSummary(summaryRes.data);
            setMonthly(monthlyRes.data);
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

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
            <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, color: '#1a237e' }}>
                Обозрение
            </Typography>

            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                {/* Зарплата */}
                <Grid item xs={6} sm={4} md={2}>
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
                </Grid>

                {/* Расходы */}
                <Grid item xs={6} sm={4} md={2}>
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
                </Grid>

                {/* Кредиты */}
                <Grid item xs={6} sm={4} md={2}>
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
                </Grid>

                {/* К оплате */}
                <Grid item xs={6} sm={4} md={2}>
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
                </Grid>

                {/* Премии */}
                <Grid item xs={6} sm={4} md={2}>
                    <Card sx={{
                        background: 'linear-gradient(135deg, #f5af19 0%, #f12711 100%)',
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
                </Grid>

                {/* Всего */}
                <Grid item xs={6} sm={4} md={2}>
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
                </Grid>
            </Grid>

            {/* Balances between contributors */}
            {summary?.balances?.length > 0 && (
                <Paper sx={{ p: 3, mb: 4 }}>
                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AccountBalance color="primary" /> Задолженности
                    </Typography>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Должник</TableCell>
                                    <TableCell>Кредитор</TableCell>
                                    <TableCell align="right">Сумма</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {summary.balances.map((balance, index) => (
                                    <TableRow key={index}>
                                        <TableCell>{balance.debtor_name}</TableCell>
                                        <TableCell>{balance.creditor_name}</TableCell>
                                        <TableCell align="right">
                                            <Chip
                                                label={formatCurrency(balance.amount, balance.currency)}
                                                color="error"
                                                size="small"
                                            />
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
                                <TableCell align="center"><strong>Посещ.</strong></TableCell>
                                <TableCell align="right"><strong>Часы</strong></TableCell>
                                <TableCell align="right"><strong>Зарплата</strong></TableCell>
                                <TableCell align="right"><strong>Расходы</strong></TableCell>
                                <TableCell align="right"><strong>Кредит</strong></TableCell>
                                <TableCell align="right"><strong>Погашение</strong></TableCell>
                                <TableCell align="right"><strong>Не выплачено</strong></TableCell>
                                <TableCell align="right"><strong>Премия</strong></TableCell>
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
                                    <TableCell align="center">{row.visits || ''}</TableCell>
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
                                    {/* Погашение - зелёный с минусом */}
                                    <TableCell align="right">
                                        {row.offset > 0 && (
                                            <Chip
                                                label={formatCurrency(-row.offset, row.currency)}
                                                sx={{ backgroundColor: '#38ef7d', color: '#1a1a1a' }}
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
