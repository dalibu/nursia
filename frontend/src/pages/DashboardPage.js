import React, { useState, useEffect } from 'react';
import {
    Typography, Paper, Box, Card, CardContent, Grid,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField, MenuItem, CircularProgress, Chip
} from '@mui/material';
import {
    TrendingUp, AccessTime, Payment, AccountBalance,
    AttachMoney, CardGiftcard
} from '@mui/icons-material';
import { balances } from '../services/api';

// Символы валют
const currencySymbols = {
    'UAH': '₴',
    'EUR': '€',
    'USD': '$',
    'RUB': '₽'
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

    const formatCurrency = (amount, currency = 'UAH', showAbsolute = false) => {
        const symbol = currencySymbols[currency] || currency;
        const value = showAbsolute ? Math.abs(Number(amount)) : Number(amount);
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
                🧮 Обозрение
            </Typography>

            {/* Summary Cards */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{
                        background: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)',
                        color: 'white'
                    }}>
                        <CardContent>
                            <Box display="flex" alignItems="center" gap={1}>
                                <AccountBalance />
                                <Typography variant="subtitle2">Задолженность</Typography>
                            </Box>
                            <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                                {formatCurrency(summary?.total_debt || 0, summary?.currency)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{
                        background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                        color: 'white'
                    }}>
                        <CardContent>
                            <Box display="flex" alignItems="center" gap={1}>
                                <Payment />
                                <Typography variant="subtitle2">Выплачено</Typography>
                            </Box>
                            <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                                {formatCurrency(summary?.total_paid || 0, summary?.currency)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{
                        background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                        color: 'white'
                    }}>
                        <CardContent>
                            <Box display="flex" alignItems="center" gap={1}>
                                <AttachMoney />
                                <Typography variant="subtitle2">Расходы</Typography>
                            </Box>
                            <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                                {formatCurrency(summary?.total_expenses || 0, summary?.currency)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{
                        background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                        color: 'white'
                    }}>
                        <CardContent>
                            <Box display="flex" alignItems="center" gap={1}>
                                <TrendingUp />
                                <Typography variant="subtitle2">Баланс</Typography>
                            </Box>
                            <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                                {formatCurrency(
                                    (summary?.total_paid || 0) - (summary?.total_debt || 0),
                                    summary?.currency
                                )}
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
                                <TableCell align="right"><strong>Netto</strong></TableCell>
                                <TableCell align="right"><strong>Выплачено</strong></TableCell>
                                <TableCell align="right"><strong>Задолженность</strong></TableCell>
                                <TableCell align="right"><strong>Расходы</strong></TableCell>
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
                                        <strong>{row.period}</strong>
                                    </TableCell>
                                    <TableCell align="center">{row.visits}</TableCell>
                                    <TableCell align="right">{row.hours.toFixed(1)}</TableCell>
                                    <TableCell align="right">{formatCurrency(row.netto, row.currency)}</TableCell>
                                    <TableCell align="right" sx={{ color: 'success.main' }}>
                                        {formatCurrency(row.paid, row.currency)}
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: 'error.main', fontWeight: row.to_pay !== 0 ? 700 : 'inherit' }}>
                                        {formatCurrency(Math.abs(row.to_pay), row.currency)}
                                    </TableCell>
                                    <TableCell align="right">{formatCurrency(row.expenses, row.currency)}</TableCell>
                                    <TableCell align="right">
                                        {row.bonus > 0 && (
                                            <Chip
                                                icon={<CardGiftcard />}
                                                label={formatCurrency(row.bonus, row.currency)}
                                                color="secondary"
                                                size="small"
                                            />
                                        )}
                                    </TableCell>
                                    <TableCell align="right">
                                        <strong>{formatCurrency(row.total, row.currency)}</strong>
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
