import React, { useState, useEffect } from 'react';
import { 
  Typography, Paper, Box, TextField, MenuItem, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import { expenses, currencies } from '../services/api';

function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    currency: 'UAH'
  });
  const [currencyList, setCurrencyList] = useState([]);

  useEffect(() => {
    loadCurrencies();
  }, []);

  const loadCurrencies = async () => {
    try {
      const response = await currencies.list();
      setCurrencyList(response.data.currencies);
    } catch (error) {
      console.error('Failed to load currencies:', error);
    }
  };

  const loadReports = async () => {
    try {
      const response = await expenses.reports(filters);
      setReports(response.data);
    } catch (error) {
      console.error('Failed to load reports:', error);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters({...filters, [field]: value});
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Отчеты
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box display="flex" gap={2} alignItems="center">
          <TextField
            label="Дата от"
            type="date"
            value={filters.start_date}
            onChange={(e) => handleFilterChange('start_date', e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Дата до"
            type="date"
            value={filters.end_date}
            onChange={(e) => handleFilterChange('end_date', e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            select
            label="Валюта"
            value={filters.currency}
            onChange={(e) => handleFilterChange('currency', e.target.value)}
            sx={{ minWidth: 120 }}
          >
            {currencyList.map((curr) => (
              <MenuItem key={curr} value={curr}>{curr}</MenuItem>
            ))}
          </TextField>
          <Button variant="contained" onClick={loadReports}>
            Сформировать
          </Button>
        </Box>
      </Paper>

      {reports.length > 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Категория</TableCell>
                <TableCell align="right">Сумма</TableCell>
                <TableCell align="right">Количество</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {reports.map((report, index) => (
                <TableRow key={index}>
                  <TableCell>{report.category}</TableCell>
                  <TableCell align="right">{report.total_amount} {filters.currency}</TableCell>
                  <TableCell align="right">{report.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

export default ReportsPage;