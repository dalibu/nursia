import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, FormControlLabel, Switch
} from '@mui/material';
import { contributors } from '../services/api';

function ContributorForm({ open, contributor, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    description: '',
    is_active: true
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (contributor) {
      setFormData({
        name: contributor.name || '',
        type: contributor.type || '',
        description: contributor.description || '',
        is_active: contributor.is_active !== false
      });
    } else {
      setFormData({
        name: '',
        type: '',
        description: '',
        is_active: true
      });
    }
  }, [contributor, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (contributor) {
        await contributors.update(contributor.id, formData);
      } else {
        await contributors.create(formData);
      }
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Failed to save contributor:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {contributor ? 'Редактировать участника' : 'Новый участник'}
      </DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent>
          <TextField
            fullWidth
            label="Название"
            margin="normal"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            disabled={loading}
          />
          <TextField
            fullWidth
            label="Тип"
            margin="normal"
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            required
            disabled={loading}
          />
          <TextField
            fullWidth
            label="Описание"
            margin="normal"
            multiline
            rows={3}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            disabled={loading}
          />
          <FormControlLabel
            control={
              <Switch
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                color="primary"
                disabled={loading}
              />
            }
            label="Активен"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={loading}>
            Отмена
          </Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export default ContributorForm;