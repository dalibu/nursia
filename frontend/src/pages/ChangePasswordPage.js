import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Paper, TextField, Button, Typography, Box, Alert } from '@mui/material';
import { auth } from '../services/api';

// Простое хеширование на клиенте
const hashPassword = async (password) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

function ChangePasswordPage() {
    const [formData, setFormData] = useState({
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const isForced = localStorage.getItem('force_password_change') === 'true';

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (formData.newPassword.length < 6) {
            setError('Новый пароль должен быть минимум 6 символов');
            return;
        }

        if (!/[0-9]/.test(formData.newPassword)) {
            setError('Новый пароль должен содержать минимум 1 цифру');
            return;
        }

        if (formData.newPassword !== formData.confirmPassword) {
            setError('Пароли не совпадают');
            return;
        }

        if (formData.oldPassword === formData.newPassword) {
            setError('Новый пароль должен отличаться от текущего');
            return;
        }

        setLoading(true);

        try {
            const oldPasswordHash = await hashPassword(formData.oldPassword);
            const newPasswordHash = await hashPassword(formData.newPassword);

            await auth.changePassword({
                old_password: oldPasswordHash,
                new_password: newPasswordHash
            });

            localStorage.removeItem('force_password_change');
            navigate('/');
        } catch (error) {
            console.error('Password change failed:', error);
            if (error.response?.data?.detail) {
                if (error.response.data.detail === 'Incorrect current password') {
                    setError('Неверный текущий пароль');
                } else if (error.response.data.detail === 'New password must be different from the current password') {
                    setError('Новый пароль должен отличаться от текущего');
                } else {
                    setError(error.response.data.detail);
                }
            } else {
                setError('Ошибка смены пароля');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container maxWidth="sm" sx={{ mt: 8 }}>
            <Paper elevation={3} sx={{ p: 4 }}>
                <Typography variant="h5" align="center" gutterBottom>
                    {isForced ? 'Требуется смена пароля' : 'Изменение пароля'}
                </Typography>
                {isForced && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        Ваш пароль был установлен администратором. Пожалуйста, установите новый пароль для продолжения работы.
                    </Alert>
                )}
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}
                <Box component="form" onSubmit={handleSubmit}>
                    <TextField
                        fullWidth
                        label="Текущий пароль"
                        type="password"
                        margin="normal"
                        value={formData.oldPassword}
                        onChange={(e) => setFormData({ ...formData, oldPassword: e.target.value })}
                        required
                    />
                    <TextField
                        fullWidth
                        label="Новый пароль"
                        type="password"
                        margin="normal"
                        value={formData.newPassword}
                        onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                        required
                        helperText="Минимум 6 символов и 1 цифра"
                    />
                    <TextField
                        fullWidth
                        label="Подтвердите новый пароль"
                        type="password"
                        margin="normal"
                        value={formData.confirmPassword}
                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                        required
                    />
                    <Button
                        type="submit"
                        fullWidth
                        variant="contained"
                        disabled={loading}
                        sx={{ mt: 3 }}
                    >
                        {loading ? 'Сохранение...' : 'Изменить пароль'}
                    </Button>
                    {!isForced && (
                        <Button
                            fullWidth
                            variant="text"
                            onClick={() => navigate(-1)}
                            sx={{ mt: 1 }}
                        >
                            Отмена
                        </Button>
                    )}
                </Box>
            </Paper>
        </Container>
    );
}

export default ChangePasswordPage;
