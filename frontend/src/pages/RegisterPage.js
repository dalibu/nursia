import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Box, Button, Container, Paper, TextField, Typography } from '@mui/material';
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

const hashPassword = async (password) => {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

function RegisterPage({ onLogin }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const turnstileSiteKey = process.env.REACT_APP_TURNSTILE_SITE_KEY || '';
  const turnstileContainerRef = useRef(null);
  const turnstileWidgetIdRef = useRef(null);
  const registerWithTokenRef = useRef(null);
  const turnstileErrorRef = useRef(null);
  const formStartedAtRef = useRef(null);
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    workspace_name: '',
    password: '',
    website: '',
  });
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [captchaReady, setCaptchaReady] = useState(false);

  const markFormStarted = () => {
    if (formStartedAtRef.current === null) {
      formStartedAtRef.current = Date.now();
    }
  };

  const getRequestError = (requestError) => {
    const code = requestError.response?.data?.detail?.code;
    if (requestError.response?.status === 429) return t('auth.registrationRateLimit');
    const messages = {
      turnstile_failed: 'turnstileError',
      turnstile_not_configured: 'turnstileUnavailable',
      turnstile_unavailable: 'turnstileUnavailable',
      disposable_email: 'disposableEmail',
      email_taken: 'emailTaken',
      verification_pending: 'verificationPending',
      registration_rejected: 'registrationRejected',
      email_not_configured: 'emailNotConfigured',
      email_unavailable: 'emailUnavailable',
      verification_invalid: 'verificationInvalid',
      verification_attempts_exceeded: 'verificationAttemptsExceeded',
      verification_resend_wait: 'verificationResendWait',
    };
    return t(`auth.${messages[code] || 'registrationError'}`);
  };

  const registerWithToken = async (token) => {
    try {
      const hashedPassword = await hashPassword(formData.password);
      await auth.register({
        ...formData,
        password: hashedPassword,
        turnstile_token: token,
        form_started_at: formStartedAtRef.current || Date.now(),
      });
      setVerificationEmail(formData.email.trim().toLowerCase());
      setError('');
    } catch (requestError) {
      console.error('Registration failed:', requestError);
      if (requestError.response?.data?.detail?.code === 'verification_pending') {
        setVerificationEmail(formData.email.trim().toLowerCase());
      }
      setError(getRequestError(requestError));
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
    if (!turnstileSiteKey) return undefined;

    let active = true;
    let widgetId = null;
    loadTurnstile()
      .then((turnstile) => {
        if (!active || !turnstileContainerRef.current) return;
        widgetId = turnstile.render(turnstileContainerRef.current, {
          sitekey: turnstileSiteKey,
          execution: 'execute',
          appearance: 'interaction-only',
          callback: (token) => registerWithTokenRef.current?.(token),
          'error-callback': () => turnstileErrorRef.current?.(),
          'expired-callback': () => turnstileErrorRef.current?.(),
        });
        turnstileWidgetIdRef.current = widgetId;
        setCaptchaReady(true);
      })
      .catch((loadError) => {
        console.error('Failed to load Cloudflare Turnstile:', loadError);
        if (active) setError(t('auth.turnstileUnavailable'));
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
    if (password.length < 8) return t('auth.passwordMinLength');
    if (!/[0-9]/.test(password)) return t('auth.passwordRequireDigit');
    if (!/[a-zA-Zа-яА-ЯіІїЇєЄґҐäöüÄÖÜß]/.test(password)) return t('auth.passwordRequireLetter');
    return '';
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setError('');
    const validationError = validatePassword(formData.password);
    if (validationError) {
      setPasswordError(validationError);
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

  const handleVerify = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await auth.verifyEmail({
        email: verificationEmail,
        code: verificationCode,
      });
      localStorage.setItem('token', response.data.access_token);
      localStorage.removeItem('force_password_change');
      onLogin();
      navigate(response.data.profile_setup_pending ? '/profile' : '/');
    } catch (requestError) {
      console.error('Email verification failed:', requestError);
      setError(getRequestError(requestError));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    setError('');
    try {
      await auth.resendVerification({ email: verificationEmail });
    } catch (requestError) {
      setError(getRequestError(requestError));
    } finally {
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
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 2 }}>
          <img src="/favicon.svg" alt="NURSIA" style={{ width: 40, height: 40 }} />
          <Typography variant="h4">NURSIA</Typography>
        </Box>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!turnstileSiteKey && !verificationEmail && (
          <Alert severity="warning" sx={{ mb: 2 }}>{t('auth.turnstileUnavailable')}</Alert>
        )}

        {verificationEmail ? (
          <Box component="form" onSubmit={handleVerify}>
            <Typography sx={{ mb: 2 }}>
              {t('auth.verificationSent', { email: verificationEmail })}
            </Typography>
            <TextField
              fullWidth
              label={t('auth.verificationCode')}
              margin="normal"
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputProps={{ inputMode: 'numeric', maxLength: 6 }}
              required
            />
            <Button type="submit" fullWidth variant="contained" disabled={loading || verificationCode.length !== 6} sx={{ mt: 2 }}>
              {loading ? t('auth.verifyingEmail') : t('auth.verifyEmail')}
            </Button>
            <Button fullWidth variant="text" disabled={loading} onClick={handleResend} sx={{ mt: 1 }}>
              {t('auth.resendVerification')}
            </Button>
          </Box>
        ) : (
          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label={t('auth.fullName')}
              margin="normal"
              value={formData.full_name}
              onFocus={markFormStarted}
              onChange={(event) => {
                markFormStarted();
                setFormData({ ...formData, full_name: event.target.value });
              }}
              required
            />
            <TextField
              fullWidth
              type="email"
              label={t('auth.email')}
              margin="normal"
              value={formData.email}
              onFocus={markFormStarted}
              onChange={(event) => {
                markFormStarted();
                setFormData({ ...formData, email: event.target.value });
              }}
              required
            />
            <TextField
              fullWidth
              label={t('auth.workspaceName')}
              margin="normal"
              value={formData.workspace_name}
              onFocus={markFormStarted}
              onChange={(event) => {
                markFormStarted();
                setFormData({ ...formData, workspace_name: event.target.value });
              }}
              required
            />
            <TextField
              fullWidth
              label={t('auth.password')}
              type="password"
              margin="normal"
              value={formData.password}
              onFocus={markFormStarted}
              onChange={(event) => {
                markFormStarted();
                setFormData({ ...formData, password: event.target.value });
                setPasswordError(validatePassword(event.target.value));
              }}
              error={!!passwordError}
              helperText={passwordError || (formData.password ? '' : t('auth.passwordRulesHint'))}
              required
            />
            <TextField
              name="website"
              value={formData.website}
              onChange={(event) => setFormData({ ...formData, website: event.target.value })}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              sx={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}
            />
            <Box ref={turnstileContainerRef} aria-hidden="true" sx={{ mt: 2 }} />
            <Button type="submit" fullWidth variant="contained" disabled={loading || !captchaReady} sx={{ mt: 3 }}>
              {loading ? t('auth.registering') : t('auth.registerButton')}
            </Button>
            <Button component={Link} to="/login" fullWidth variant="text" sx={{ mt: 1 }}>
              {t('auth.alreadyHaveAccount')}
            </Button>
          </Box>
        )}
      </Paper>
    </Container>
  );
}

export default RegisterPage;
