import React, { useState, useEffect } from 'react';
import {
  Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Box, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Button, TablePagination
} from '@mui/material';
import { Edit } from '@mui/icons-material';

function SettingsPage() {
  const [settings, setSettings] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSetting, setEditingSetting] = useState(null);
  const [formData, setFormData] = useState({ key: '', value: '', description: '' });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings/', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setSettings(data);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleEdit = (setting) => {
    setEditingSetting(setting);
    setFormData({
      key: setting.key,
      value: setting.value,
      description: setting.description || ''
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await fetch(`/api/settings/${editingSetting.key}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          value: formData.value,
          description: formData.description
        })
      });
      handleFormClose();
      loadSettings();
    } catch (error) {
      console.error('Failed to save setting:', error);
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingSetting(null);
    setFormData({ key: '', value: '', description: '' });
  };

  return (
    <Box>
      <Typography variant="h4" mb={3}>Системные настройки</Typography>

      <TableContainer component={Paper} sx={{ maxHeight: '70vh' }}>
        <Table size="small" stickyHeader>
          <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
            <TableRow>
              <TableCell>Ключ</TableCell>
              <TableCell>Значение</TableCell>
              <TableCell>Описание</TableCell>
              <TableCell>Дата создания</TableCell>
              <TableCell sx={{ width: 80 }}>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {settings
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((setting) => (
              <TableRow key={setting.key}>
                <TableCell>{setting.key}</TableCell>
                <TableCell>{setting.value}</TableCell>
                <TableCell>{setting.description || '-'}</TableCell>
                <TableCell>{new Date(setting.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <IconButton onClick={() => handleEdit(setting)}>
                    <Edit />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      
      <TablePagination
        component="div"
        count={settings.length}
        page={page}
        onPageChange={(event, newPage) => setPage(newPage)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(event) => {
          setRowsPerPage(parseInt(event.target.value, 10));
          setPage(0);
        }}
        rowsPerPageOptions={[10, 25, 50]}
        labelRowsPerPage="Строк на странице:"
        labelDisplayedRows={({ from, to, count }) => `${from}-${to} из ${count}`}
      />

      <Dialog open={showForm} onClose={handleFormClose} maxWidth="sm" fullWidth>
        <DialogTitle>Редактировать настройку</DialogTitle>
        <Box component="form" onSubmit={handleSubmit}>
          <DialogContent>
            <TextField
              fullWidth
              label="Ключ"
              margin="normal"
              value={formData.key}
              disabled
            />
            <TextField
              fullWidth
              label="Значение"
              margin="normal"
              multiline
              rows={3}
              value={formData.value}
              onChange={(e) => setFormData({...formData, value: e.target.value})}
              required
            />
            <TextField
              fullWidth
              label="Описание"
              margin="normal"
              multiline
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleFormClose}>Отмена</Button>
            <Button type="submit" variant="contained">Сохранить</Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}

export default SettingsPage;