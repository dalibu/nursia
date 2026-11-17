import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Container, Paper, TextField, Button, Typography, Box, Alert } from '@mui/material';
import { auth } from '../services/api';
import LanguageSwitcher from '../components/LanguageSwitcher';
import ThemeSwitcher from '../components/ThemeSwitcher';

let turnstileScriptPromise;

const loadTurnstile = () => {
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }
  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (window.turnstile) {
          resolve(window.turnstile);
        } else {
          reject(new Error('Cloudflare Turnstile failed to initialize'));
        }
      };
      script.onerror = () => reject(new Error('Cloudflare Turnstile script failed to load'));
      document.head.appendChild(script);
    });
  }
  return turnstileScriptPromise;
};

// Простое хеширование на клиенте
const hashPassword = async (password) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

function RegisterPage({ onLogin }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const turnstileSiteKey = process.env.REACT_APP_TURNSTILE_SITE_KEY || '';
  const turnstileContainerRef = useRef(null);
  const turnstileWidgetIdRef = useRef(null);
  const registerWithTokenRef = useRef(null);
  const turnstileErrorRef = useRef(null);
  const [formData, setFormData] = useState({
    password: '',
    full_name: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [captchaReady, setCaptchaReady] = useState(false);

  const registerWithToken = async (token) => {
    try {
      const hashedPassword = await hashPassword(formData.password);
      const response = await auth.register({
        full_name: formData.full_name,
        password: hashedPassword,
        turnstile_token: token
      });
      localStorage.setItem('token', response.data.access_token);
      localStorage.removeItem('force_password_change');
      onLogin();
      navigate('/profile');
    } catch (requestError) {
      console.error('Registration failed:', requestError);
      const detail = requestError.response?.data?.detail;
      if (requestError.response?.status === 429) {
        setError(t('auth.registrationRateLimit'));
      } else if (detail?.code === 'turnstile_failed') {
        setError(t('auth.turnstileError'));
      } else if (detail?.code === 'turnstile_not_configured' || detail?.code === 'turnstile_unavailable') {
        setError(t('auth.turnstileUnavailable'));
      } else {
        setError(t('auth.registrationError'));
      }
    } finally {
      setLoading(false);
    }
  };
  registerWithTokenRef.current = registerWithToken;

  const handleTurnstileError = () => {
    setError(t('auth.turnstileError'));
    setLoading(false);
  };
  turnstileErrorRef.current = handleTurnstileError;

  useEffect(() => {
    if (!turnstileSiteKey) {
      return undefined;
    }

    let active = true;
    let widgetId = null;
    loadTurnstile()
      .then((turnstile) => {
        if (!active || !turnstileContainerRef.current) {
          return;
        }
        widgetId = turnstile.render(turnstileContainerRef.current, {
          sitekey: turnstileSiteKey,
          size: 'invisible',
          execution: 'execute',
          callback: (token) => registerWithTokenRef.current?.(token),
          'error-callback': () => turnstileErrorRef.current?.(),
          'expired-callback': () => turnstileErrorRef.current?.()
        });
        turnstileWidgetIdRef.current = widgetId;
        setCaptchaReady(true);
      })
      .catch((loadError) => {
        console.error('Failed to load Cloudflare Turnstile:', loadError);
        if (active) {
          setError(t('auth.turnstileUnavailable'));
        }
      });

    return () => {
      active = false;
      if (widgetId !== null && window.turnstile) {
        window.turnstile.remove(widgetId);
        turnstileWidgetIdRef.current = null;
      }
    };
  }, [turnstileSiteKey, t]);

  const validatePassword = (password) => {
    if (password.length < 6) {
      return t('auth.passwordMinLength');
    }
    if (!/[0-9]/.test(password)) {
      return t('auth.passwordRequireDigit');
    }
    if (!/[a-zA-Zа-яА-ЯіІїЇєЄґҐäöüÄÖÜß]/.test(password)) {
      return t('auth.passwordRequireLetter');
    }
    return '';
  };

  const handlePasswordChange = (e) => {
    const password = e.target.value;
    setFormData({ ...formData, password });
    setPasswordError(validatePassword(password));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const passwordValidation = validatePassword(formData.password);
    if (passwordValidation) {
      setPasswordError(passwordValidation);
      return;
    }

    if (!turnstileSiteKey || !captchaReady || turnstileWidgetIdRef.current === null) {
      setError(t('auth.turnstileUnavailable'));
      return;
    }

    setLoading(true);
    try {
      window.turnstile.reset(turnstileWidgetIdRef.current);
      window.turnstile.execute(turnstileWidgetIdRef.current);
    } catch (turnstileError) {
      console.error('Failed to execute Cloudflare Turnstile:', turnstileError);
      setError(t('auth.turnstileError'));
      setLoading(false);
    }
  };

  const languageSwitcher = (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
      <LanguageSwitcher />
      <ThemeSwitcher />
    </Box>
  );

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        {languageSwitcher}
        <Typography variant="h6" align="center" gutterBottom>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 2 }}>
            <img src="/favicon.svg" alt="NURSIA" style={{ width: 40, height: 40 }} />
            <Typography variant="h4">
              NURSIA
            </Typography>
          </Box>
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {!turnstileSiteKey && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('auth.turnstileUnavailable')}
          </Alert>
        )}
        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label={t('auth.fullName')}
            margin="normal"
            value={formData.full_name}
            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            required
          />
          <TextField
            fullWidth
            label={t('auth.password')}
            type="password"
            margin="normal"
            value={formData.password}
            onChange={handlePasswordChange}
            error={!!passwordError}
            helperText={passwordError || (formData.password ? '' : t('auth.passwordRulesHint'))}
            required
          />
          <Box
            ref={turnstileContainerRef}
            aria-hidden="true"
            sx={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            disabled={loading || !captchaReady}
            sx={{ mt: 3 }}
          >
            {loading ? t('auth.registering') : t('auth.registerButton')}
          </Button>
          <Button
            component={Link}
            to="/login"
            fullWidth
            variant="text"
            sx={{ mt: 1 }}
          >
            {t('auth.alreadyHaveAccount')}
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}

export default RegisterPage;
