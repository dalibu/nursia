import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { auth, workspaces } from '../services/api';

function WorkspaceSwitcher() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [error, setError] = useState('');

  const loadWorkspaces = async () => {
    try {
      const [workspaceResponse, userResponse] = await Promise.all([
        workspaces.list(),
        auth.me(),
      ]);
      setItems(workspaceResponse.data);
      setSelectedId(String(userResponse.data.workspace_id || ''));
    } catch (requestError) {
      console.error('Failed to load workspaces:', requestError);
    }
  };

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const switchWorkspace = async (workspaceId) => {
    setError('');
    try {
      const response = await workspaces.switch({ workspace_id: Number(workspaceId) });
      localStorage.setItem('token', response.data.access_token);
      window.location.reload();
    } catch (requestError) {
      console.error('Failed to switch workspace:', requestError);
      setError(t('workspace.switchFailed'));
    }
  };

  const createWorkspace = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const response = await workspaces.create({ name: workspaceName });
      setCreateOpen(false);
      setWorkspaceName('');
      await switchWorkspace(response.data.id);
    } catch (requestError) {
      console.error('Failed to create workspace:', requestError);
      setError(t('workspace.createFailed'));
    }
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1, mb: 2 }}>
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {items.length > 1 && (
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <Select
            value={selectedId}
            displayEmpty
            onChange={(event) => switchWorkspace(event.target.value)}
            aria-label={t('workspace.current')}
          >
            {items.map((workspace) => (
              <MenuItem key={workspace.id} value={String(workspace.id)}>
                {workspace.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
      <Button size="small" onClick={() => setCreateOpen(true)}>
        {t('workspace.create')}
      </Button>
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <Box component="form" onSubmit={createWorkspace}>
          <DialogTitle>{t('workspace.create')}</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              margin="dense"
              label={t('workspace.name')}
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              inputProps={{ minLength: 2, maxLength: 100 }}
              required
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="contained">{t('workspace.create')}</Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}

export default WorkspaceSwitcher;
