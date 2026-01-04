import React, { useState, useEffect, useCallback } from 'react';
import {
    Typography, Paper, Box, Button, Card, CardContent,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField, Dialog, DialogTitle, DialogContent, DialogActions,
    CircularProgress, Chip, IconButton, Alert, Snackbar,
    MenuItem, Tabs, Tab, Checkbox, FormControlLabel, Tooltip,
    List, ListItem, ListItemText, ListItemSecondaryAction
} from '@mui/material';
import {
    Add, Edit, Delete, Security, VpnKey, Person, Refresh,
    CheckCircle, Cancel, AdminPanelSettings
} from '@mui/icons-material';
import { admin, usersApi } from '../services/api';

function RolesPage() {
    const [loading, setLoading] = useState(true);
    const [roles, setRoles] = useState([]);
    const [permissions, setPermissions] = useState([]);
    const [users, setUsers] = useState([]);
    const [tabIndex, setTabIndex] = useState(0);

    // Snackbar
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const showMessage = (message, severity = 'success') => setSnackbar({ open: true, message, severity });

    // Role dialog
    const [roleDialog, setRoleDialog] = useState(false);
    const [editingRole, setEditingRole] = useState(null);
    const [roleForm, setRoleForm] = useState({ name: '', type: 'business', description: '' });

    // Permission dialog
    const [permDialog, setPermDialog] = useState(false);
    const [editingPerm, setEditingPerm] = useState(null);
    const [permForm, setPermForm] = useState({ name: '', description: '' });

    // Role permissions dialog
    const [rolePermDialog, setRolePermDialog] = useState(false);
    const [selectedRole, setSelectedRole] = useState(null);
    const [selectedPermissions, setSelectedPermissions] = useState([]);

    // User roles dialog
    const [userRolesDialog, setUserRolesDialog] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [selectedRoles, setSelectedRoles] = useState([]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [rolesRes, permsRes, usersRes] = await Promise.all([
                admin.getRoles(),
                admin.getPermissions(),
                usersApi.list()
            ]);
            setRoles(rolesRes.data);
            setPermissions(permsRes.data);
            setUsers(usersRes.data || []);
        } catch (error) {
            console.error('Failed to load data:', error);
            showMessage('Ошибка загрузки данных', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // ========== ROLES ==========
    const openRoleDialog = (role = null) => {
        setEditingRole(role);
        setRoleForm(role ? { name: role.name, type: role.type, description: role.description || '' } : { name: '', type: 'business', description: '' });
        setRoleDialog(true);
    };

    const saveRole = async () => {
        try {
            if (editingRole) {
                await admin.updateRole(editingRole.id, roleForm);
                showMessage('Роль обновлена');
            } else {
                await admin.createRole(roleForm);
                showMessage('Роль создана');
            }
            setRoleDialog(false);
            loadData();
        } catch (error) {
            showMessage(error.response?.data?.detail || 'Ошибка сохранения', 'error');
        }
    };

    const deleteRole = async (role) => {
        if (!window.confirm(`Удалить роль "${role.name}"?`)) return;
        try {
            await admin.deleteRole(role.id);
            showMessage('Роль удалена');
            loadData();
        } catch (error) {
            showMessage(error.response?.data?.detail || 'Ошибка удаления', 'error');
        }
    };

    // ========== PERMISSIONS ==========
    const openPermDialog = (perm = null) => {
        setEditingPerm(perm);
        setPermForm(perm ? { name: perm.name, description: perm.description || '' } : { name: '', description: '' });
        setPermDialog(true);
    };

    const savePerm = async () => {
        try {
            if (editingPerm) {
                await admin.updatePermission(editingPerm.id, permForm);
                showMessage('Разрешение обновлено');
            } else {
                await admin.createPermission(permForm);
                showMessage('Разрешение создано');
            }
            setPermDialog(false);
            loadData();
        } catch (error) {
            showMessage(error.response?.data?.detail || 'Ошибка сохранения', 'error');
        }
    };

    const deletePerm = async (perm) => {
        if (!window.confirm(`Удалить разрешение "${perm.name}"?`)) return;
        try {
            await admin.deletePermission(perm.id);
            showMessage('Разрешение удалено');
            loadData();
        } catch (error) {
            showMessage(error.response?.data?.detail || 'Ошибка удаления', 'error');
        }
    };

    // ========== ROLE PERMISSIONS ==========
    const openRolePermDialog = (role) => {
        setSelectedRole(role);
        const currentPermIds = permissions.filter(p => role.permissions.includes(p.name)).map(p => p.id);
        setSelectedPermissions(currentPermIds);
        setRolePermDialog(true);
    };

    const saveRolePermissions = async () => {
        try {
            await admin.setRolePermissions(selectedRole.id, selectedPermissions);
            showMessage('Разрешения роли обновлены');
            setRolePermDialog(false);
            loadData();
        } catch (error) {
            showMessage(error.response?.data?.detail || 'Ошибка сохранения', 'error');
        }
    };

    const togglePermission = (permId) => {
        setSelectedPermissions(prev =>
            prev.includes(permId) ? prev.filter(id => id !== permId) : [...prev, permId]
        );
    };

    // ========== USER ROLES ==========
    const openUserRolesDialog = async (user) => {
        setSelectedUser(user);
        try {
            const res = await admin.getUserRoles(user.id);
            setSelectedRoles(res.data.roles.map(r => r.id));
            setUserRolesDialog(true);
        } catch (error) {
            showMessage('Ошибка загрузки ролей пользователя', 'error');
        }
    };

    const saveUserRoles = async () => {
        if (selectedRoles.length === 0) {
            showMessage('Необходимо выбрать хотя бы одну роль', 'error');
            return;
        }
        try {
            await admin.setUserRoles(selectedUser.id, selectedRoles);
            showMessage('Роли пользователя обновлены');
            setUserRolesDialog(false);
            loadData();
        } catch (error) {
            showMessage(error.response?.data?.detail || 'Ошибка сохранения', 'error');
        }
    };

    const toggleRole = (roleId) => {
        setSelectedRoles(prev =>
            prev.includes(roleId) ? prev.filter(id => id !== roleId) : [...prev, roleId]
        );
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
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" sx={{ fontWeight: 600, color: '#1a237e' }}>
                    <AdminPanelSettings sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Управление ролями и правами
                </Typography>
                <IconButton onClick={loadData} color="primary">
                    <Refresh />
                </IconButton>
            </Box>

            <Tabs value={tabIndex} onChange={(e, v) => setTabIndex(v)} sx={{ mb: 3 }}>
                <Tab icon={<Security />} label="Роли" />
                <Tab icon={<VpnKey />} label="Разрешения" />
                <Tab icon={<Person />} label="Пользователи" />
            </Tabs>

            {/* ========== TAB: ROLES ========== */}
            {tabIndex === 0 && (
                <Paper sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="h6">Роли системы</Typography>
                        <Button variant="contained" startIcon={<Add />} onClick={() => openRoleDialog()}>
                            Добавить роль
                        </Button>
                    </Box>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                                    <TableCell><strong>Название</strong></TableCell>
                                    <TableCell><strong>Тип</strong></TableCell>
                                    <TableCell><strong>Описание</strong></TableCell>
                                    <TableCell><strong>Разрешения</strong></TableCell>
                                    <TableCell align="right"><strong>Действия</strong></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {roles.map(role => (
                                    <TableRow key={role.id} hover>
                                        <TableCell>
                                            <Chip
                                                label={role.name}
                                                color={role.name === 'admin' ? 'error' : role.name === 'employer' ? 'primary' : 'default'}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Chip label={role.type} variant="outlined" size="small" />
                                        </TableCell>
                                        <TableCell>{role.description || '—'}</TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                                {role.permissions.length > 0 ? (
                                                    role.permissions.slice(0, 3).map(p => (
                                                        <Chip key={p} label={p} size="small" variant="outlined" color="primary" />
                                                    ))
                                                ) : (
                                                    <Typography variant="body2" color="text.secondary">—</Typography>
                                                )}
                                                {role.permissions.length > 3 && (
                                                    <Chip label={`+${role.permissions.length - 3}`} size="small" />
                                                )}
                                            </Box>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Tooltip title="Настроить разрешения">
                                                <IconButton size="small" onClick={() => openRolePermDialog(role)}>
                                                    <VpnKey />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Редактировать">
                                                <IconButton size="small" onClick={() => openRoleDialog(role)}>
                                                    <Edit />
                                                </IconButton>
                                            </Tooltip>
                                            {!['admin', 'worker', 'employer'].includes(role.name) && (
                                                <Tooltip title="Удалить">
                                                    <IconButton size="small" color="error" onClick={() => deleteRole(role)}>
                                                        <Delete />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}

            {/* ========== TAB: PERMISSIONS ========== */}
            {tabIndex === 1 && (
                <Paper sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="h6">Разрешения</Typography>
                        <Button variant="contained" startIcon={<Add />} onClick={() => openPermDialog()}>
                            Добавить разрешение
                        </Button>
                    </Box>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                                    <TableCell><strong>Название</strong></TableCell>
                                    <TableCell><strong>Описание</strong></TableCell>
                                    <TableCell align="right"><strong>Действия</strong></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {permissions.map(perm => (
                                    <TableRow key={perm.id} hover>
                                        <TableCell>
                                            <Chip label={perm.name} color="primary" variant="outlined" size="small" />
                                        </TableCell>
                                        <TableCell>{perm.description || '—'}</TableCell>
                                        <TableCell align="right">
                                            <Tooltip title="Редактировать">
                                                <IconButton size="small" onClick={() => openPermDialog(perm)}>
                                                    <Edit />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Удалить">
                                                <IconButton size="small" color="error" onClick={() => deletePerm(perm)}>
                                                    <Delete />
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {permissions.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={3} align="center">
                                            <Typography color="text.secondary">Нет разрешений</Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}

            {/* ========== TAB: USERS ========== */}
            {tabIndex === 2 && (
                <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>Роли пользователей</Typography>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                                    <TableCell><strong>Пользователь</strong></TableCell>
                                    <TableCell><strong>Логин</strong></TableCell>
                                    <TableCell><strong>Email</strong></TableCell>
                                    <TableCell><strong>Роли</strong></TableCell>
                                    <TableCell align="right"><strong>Действия</strong></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {users.filter(u => u.status !== 'deleted').map(user => (
                                    <TableRow key={user.id} hover>
                                        <TableCell>{user.full_name}</TableCell>
                                        <TableCell>{user.username}</TableCell>
                                        <TableCell>{user.email || '—'}</TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                                {(user.roles || []).map(role => (
                                                    <Chip
                                                        key={role.id || role}
                                                        label={role.name || role}
                                                        color={role.name === 'admin' || role === 'admin' ? 'error' : 'default'}
                                                        size="small"
                                                    />
                                                ))}
                                            </Box>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Tooltip title="Настроить роли">
                                                <IconButton size="small" color="primary" onClick={() => openUserRolesDialog(user)}>
                                                    <Security />
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}

            {/* ========== DIALOGS ========== */}

            {/* Role Create/Edit Dialog */}
            <Dialog open={roleDialog} onClose={() => setRoleDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{editingRole ? 'Редактировать роль' : 'Новая роль'}</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        label="Название"
                        value={roleForm.name}
                        onChange={e => setRoleForm({ ...roleForm, name: e.target.value })}
                        sx={{ mt: 2 }}
                        disabled={editingRole && editingRole.name === 'admin'}
                    />
                    <TextField
                        select
                        fullWidth
                        label="Тип"
                        value={roleForm.type}
                        onChange={e => setRoleForm({ ...roleForm, type: e.target.value })}
                        sx={{ mt: 2 }}
                    >
                        <MenuItem value="auth">Авторизация (auth)</MenuItem>
                        <MenuItem value="business">Бизнес (business)</MenuItem>
                    </TextField>
                    <TextField
                        fullWidth
                        label="Описание"
                        value={roleForm.description}
                        onChange={e => setRoleForm({ ...roleForm, description: e.target.value })}
                        sx={{ mt: 2 }}
                        multiline
                        rows={2}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRoleDialog(false)}>Отмена</Button>
                    <Button variant="contained" onClick={saveRole}>Сохранить</Button>
                </DialogActions>
            </Dialog>

            {/* Permission Create/Edit Dialog */}
            <Dialog open={permDialog} onClose={() => setPermDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{editingPerm ? 'Редактировать разрешение' : 'Новое разрешение'}</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        label="Название (код)"
                        value={permForm.name}
                        onChange={e => setPermForm({ ...permForm, name: e.target.value })}
                        sx={{ mt: 2 }}
                        placeholder="manage_users"
                    />
                    <TextField
                        fullWidth
                        label="Описание"
                        value={permForm.description}
                        onChange={e => setPermForm({ ...permForm, description: e.target.value })}
                        sx={{ mt: 2 }}
                        multiline
                        rows={2}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPermDialog(false)}>Отмена</Button>
                    <Button variant="contained" onClick={savePerm}>Сохранить</Button>
                </DialogActions>
            </Dialog>

            {/* Role Permissions Dialog */}
            <Dialog open={rolePermDialog} onClose={() => setRolePermDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    Разрешения роли: {selectedRole?.name}
                </DialogTitle>
                <DialogContent>
                    {permissions.length === 0 ? (
                        <Alert severity="info" sx={{ mt: 2 }}>
                            Нет доступных разрешений. Создайте разрешения на вкладке "Разрешения".
                        </Alert>
                    ) : (
                        <List>
                            {permissions.map(perm => (
                                <ListItem key={perm.id} dense button onClick={() => togglePermission(perm.id)}>
                                    <Checkbox
                                        edge="start"
                                        checked={selectedPermissions.includes(perm.id)}
                                        tabIndex={-1}
                                        disableRipple
                                    />
                                    <ListItemText
                                        primary={perm.name}
                                        secondary={perm.description}
                                    />
                                </ListItem>
                            ))}
                        </List>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRolePermDialog(false)}>Отмена</Button>
                    <Button variant="contained" onClick={saveRolePermissions}>Сохранить</Button>
                </DialogActions>
            </Dialog>

            {/* User Roles Dialog */}
            <Dialog open={userRolesDialog} onClose={() => setUserRolesDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    Роли пользователя: {selectedUser?.full_name}
                </DialogTitle>
                <DialogContent>
                    <List>
                        {roles.map(role => (
                            <ListItem key={role.id} dense button onClick={() => toggleRole(role.id)}>
                                <Checkbox
                                    edge="start"
                                    checked={selectedRoles.includes(role.id)}
                                    tabIndex={-1}
                                    disableRipple
                                />
                                <ListItemText
                                    primary={role.name}
                                    secondary={role.description}
                                />
                            </ListItem>
                        ))}
                    </List>
                    <Alert severity="warning" sx={{ mt: 2 }}>
                        У пользователя должна быть хотя бы одна роль
                    </Alert>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setUserRolesDialog(false)}>Отмена</Button>
                    <Button variant="contained" onClick={saveUserRoles}>Сохранить</Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}

export default RolesPage;
