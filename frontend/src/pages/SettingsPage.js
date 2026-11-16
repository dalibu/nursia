import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Box, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Button, TablePagination,
  Switch, FormControlLabel, Chip
} from '@mui/material';
import { Edit, Check, Close } from '@mui/icons-material';

function SettingsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSetting, setEditingSetting] = useState(null);
  const [formData, setFormData] = useState({ key: '', value: '', value_type: 'string', description: '' });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [error, setError] = useState('');

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
      value_type: setting.value_type || 'string',
      description: setting.description || ''
    });
    setError('');
    setShowForm(true);
  };

  const handleBooleanToggle = async (setting) => {
    const newValue = setting.value === 'true' ? 'false' : 'true';
    try {
      await fetch(`/api/settings/${setting.key}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          value: newValue,
          description: setting.description
        })
      });
      loadSettings();
    } catch (error) {
      console.error('Failed to toggle setting:', error);
    }
  };

  const validateValue = (value, type) => {
    if (type === 'number') {
      if (value === '' || isNaN(Number(value))) {
        return t('settings.invalidNumber');
      }
    }
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationError = validateValue(formData.value, formData.value_type);
    if (validationError) {
      setError(validationError);
      return;
    }

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
    setFormData({ key: '', value: '', value_type: 'string', description: '' });
    setError('');
  };

  const renderValue = (setting) => {
    if (setting.value_type === 'boolean') {
      return (
        <Chip
          icon={setting.value === 'true' ? <Check /> : <Close />}
          label={setting.value === 'true' ? t('settings.on') : t('settings.off')}
          color={setting.value === 'true' ? 'success' : 'default'}
          size="small"
          onClick={() => handleBooleanToggle(setting)}
          sx={{ cursor: 'pointer' }}
        />
      );
    }
    return setting.value;
  };

  const renderFormInput = () => {
    if (formData.value_type === 'boolean') {
      return (
        <FormControlLabel
          control={
            <Switch
              checked={formData.value === 'true'}
              onChange={(e) => setFormData({ ...formData, value: e.target.checked ? 'true' : 'false' })}
            />
          }
          label={formData.value === 'true' ? t('settings.enabled') : t('settings.disabled')}
          sx={{ mt: 2 }}
        />
      );
    }

    return (
      <TextField
        fullWidth
        label={t('settings.value')}
        margin="normal"
        multiline={formData.value_type === 'string'}
        rows={formData.value_type === 'string' ? 3 : 1}
        type={formData.value_type === 'number' ? 'number' : 'text'}
        value={formData.value}
        onChange={(e) => {
          setFormData({ ...formData, value: e.target.value });
          setError('');
        }}
        error={!!error}
        helperText={error}
        required
      />
    );
  };

  return (
    <Box>
      <Typography variant="h6" mb={3}>{t('settings.pageTitle')}</Typography>

      <TableContainer component={Paper} sx={{ maxHeight: '70vh' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>{t('settings.key')}</TableCell>
              <TableCell>{t('settings.value')}</TableCell>
              <TableCell>{t('settings.type')}</TableCell>
              <TableCell>{t('payments.description')}</TableCell>
              <TableCell sx={{ width: 80 }}>{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {settings
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((setting) => (
                <TableRow key={setting.key}>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{setting.key}</TableCell>
                  <TableCell>{renderValue(setting)}</TableCell>
                  <TableCell>
                    <Chip
                      label={setting.value_type || 'string'}
                      size="small"
                      variant="outlined"
                      color={setting.value_type === 'boolean' ? 'primary' : setting.value_type === 'number' ? 'secondary' : 'default'}
                    />
                  </TableCell>
                  <TableCell>{setting.description || '-'}</TableCell>
                  <TableCell>
                    <IconButton onClick={() => handleEdit(setting)} size="small">
                      <Edit fontSize="small" />
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
        rowsPerPageOptions={Array.of(10, 25, 50)}
      />

      <Dialog open={showForm} onClose={handleFormClose} maxWidth="sm" fullWidth>
        <DialogTitle>{t('settings.editSetting')}</DialogTitle>
        <Box component="form" onSubmit={handleSubmit}>
          <DialogContent>
            <TextField
              fullWidth
              label={t('settings.key')}
              margin="normal"
              value={formData.key}
              disabled
            />
            {renderFormInput()}
            <TextField
              fullWidth
              label={t('payments.description')}
              margin="normal"
              multiline
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleFormClose}>{t('common.cancel')}</Button>
            <Button type="submit" variant="contained">{t('common.save')}</Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}

export default SettingsPage;
