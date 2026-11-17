import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Box, Button, Container, Paper, TextField, Typography } from '@mui/material';
import { workspaces } from '../services/api';
import LanguageSwitcher from '../components/LanguageSwitcher';
import ThemeSwitcher from '../components/ThemeSwitcher';

const hashPassword = async (password) => {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

function InvitePage({ onLogin }) {
  const { token } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    workspaces.previewInvite(token)
      .then(({ data }) => {
        if (active) setInvite(data);
      })
      .catch(() => {
        if (active) setError(t('workspace.inviteInvalid'));
      });
    return () => {
      active = false;
    };
  }, [token, t]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const hashedPassword = await hashPassword(password);
      const response = await workspaces.acceptInvite({
        token,
        full_name: fullName,
        password: hashedPassword,
      });
      localStorage.setItem('token', response.data.access_token);
      onLogin();
      navigate(response.data.profile_setup_pending ? '/profile' : '/');
    } catch (requestError) {
      const code = requestError.response?.data?.detail?.code;
      setError(t(`workspace.${code || 'inviteAcceptFailed'}`));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          <LanguageSwitcher />
          <ThemeSwitcher />
        </Box>
        <Typography variant="h4" align="center" gutterBottom>NURSIA</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {invite && (
          <>
            <Typography sx={{ mb: 2 }}>
              {t('workspace.invitedTo', { workspace: invite.workspace_name })}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {invite.email}
            </Typography>
            <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
              <TextField
                fullWidth
                label={t('auth.fullName')}
                margin="normal"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
              />
              <TextField
                fullWidth
                label={t('auth.password')}
                type="password"
                margin="normal"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                inputProps={{ minLength: 8, maxLength: 128 }}
                required
              />
              <Button type="submit" fullWidth variant="contained" disabled={loading} sx={{ mt: 2 }}>
                {loading ? t('workspace.acceptingInvite') : t('workspace.acceptInvite')}
              </Button>
              <Button component={Link} to="/login" fullWidth variant="text" sx={{ mt: 1 }}>
                {t('auth.alreadyHaveAccount')}
              </Button>
            </Box>
          </>
        )}
      </Paper>
    </Container>
  );
}

export default InvitePage;
