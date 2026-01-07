import React, { useRef, memo, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNavigate } from 'react-router-dom';
import {
    Table, TableBody, TableCell, TableHead, TableRow,
    Box, IconButton, Chip, Tooltip, Typography
} from '@mui/material';
import {
    Edit, Delete, Replay, Payment
} from '@mui/icons-material';

const ROW_HEIGHT = 53;

// Date formatting helpers (same as original PaymentsPage)
const formatDateFull = (dateInput) => {
    if (!dateInput) return '—';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '—';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
};

const formatTimeFull = (dateInput) => {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
};

// Memoized row component for performance
const PaymentRow = memo(({
    payment,
    onEdit,
    onDelete,
    onRepeat,
    onToggleStatus,
    canManagePaymentStatus,
    currencies,
    isAdmin,
    columnWidths
}) => {
    const navigate = useNavigate();
    const symbol = currencies.find(c => c.code === payment.currency)?.symbol || payment.currency;

    return (
        <TableRow sx={{ '& td': { verticalAlign: 'middle' } }}>
            {/* Номер */}
            <TableCell sx={{ width: columnWidths.tracking_nr, minWidth: columnWidths.tracking_nr, px: 0.5, fontSize: '0.75rem' }}>
                {payment.tracking_nr || '-'}
            </TableCell>

            {/* Когда */}
            <TableCell sx={{ width: columnWidths.payment_date }}>
                <div style={{ lineHeight: 1 }}>
                    {payment.modified_at ? (
                        <Tooltip title={`Отредактировано: ${formatDateFull(payment.modified_at)} ${formatTimeFull(payment.modified_at)}`} arrow placement="top">
                            <div>
                                <div style={{ color: '#ff9800' }}>{formatDateFull(payment.modified_at)}</div>
                                <div style={{ fontSize: '0.85em', color: '#ff9800' }}>{formatTimeFull(payment.modified_at)}</div>
                            </div>
                        </Tooltip>
                    ) : (
                        <>
                            <div>{formatDateFull(payment.payment_date)}</div>
                            <div style={{ fontSize: '0.85em', color: 'rgba(0,0,0,0.6)' }}>{formatTimeFull(payment.payment_date)}</div>
                        </>
                    )}
                </div>
            </TableCell>

            {/* От кого */}
            <TableCell sx={{ cursor: 'default', width: columnWidths.payer }}>
                <span
                    style={{
                        textDecoration: (payment.payer?.name || payment.payer?.full_name) && isAdmin ? 'underline' : 'none',
                        textDecorationStyle: 'dotted',
                        textDecorationColor: 'rgba(25, 118, 210, 0.5)'
                    }}
                >
                    {payment.payer?.name || payment.payer?.full_name || '-'}
                </span>
            </TableCell>

            {/* Кому */}
            <TableCell sx={{ cursor: 'default', width: columnWidths.recipient }}>
                <span
                    style={{
                        textDecoration: payment.recipient?.full_name && isAdmin ? 'underline' : 'none',
                        textDecorationStyle: 'dotted',
                        textDecorationColor: 'rgba(25, 118, 210, 0.5)'
                    }}
                >
                    {payment.recipient?.full_name || '-'}
                </span>
            </TableCell>

            {/* Сумма */}
            <TableCell sx={{ whiteSpace: 'nowrap', width: columnWidths.amount }}>
                {payment.amount} {symbol}
            </TableCell>

            {/* Категория */}
            <TableCell sx={{ width: columnWidths.category }}>
                {['Аванс', 'Долг'].includes(payment.category?.name)
                    ? (
                        <Chip
                            label={payment.category.name}
                            size="small"
                            sx={{
                                backgroundColor: '#FFEB3B',
                                color: '#000',
                            }}
                        />
                    )
                    : (payment.category?.name || '-')}
            </TableCell>

            {/* Комментарий */}
            <Tooltip title={payment.description || ''} arrow placement="top">
                <TableCell sx={{ width: columnWidths.description, maxWidth: columnWidths.description, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {payment.description || '-'}
                </TableCell>
            </Tooltip>

            {/* Смена */}
            <TableCell align="center" sx={{ width: columnWidths.assignment }}>
                {payment.assignment_tracking_nr ? (
                    <Chip
                        label={payment.assignment_tracking_nr}
                        size="small"
                        color="primary"
                        clickable
                        onClick={() => navigate(`/time-tracker?search=${payment.assignment_tracking_nr}`)}
                        sx={{ cursor: 'pointer' }}
                    />
                ) : (
                    <Typography variant="caption" color="text.secondary">—</Typography>
                )}
            </TableCell>

            {/* Статус */}
            <TableCell sx={{ width: columnWidths.status }}>
                <Chip
                    label={payment.payment_status === 'paid' ? 'Оплачено' : 'К оплате'}
                    color={payment.payment_status === 'paid' ? 'success' : 'warning'}
                    size="small"
                    clickable={canManagePaymentStatus}
                    onClick={canManagePaymentStatus ? () => {
                        const nextStatus = payment.payment_status === 'unpaid' ? 'paid' : 'unpaid';
                        onToggleStatus(payment.id, nextStatus);
                    } : undefined}
                    icon={<Payment />}
                    sx={{
                        cursor: canManagePaymentStatus ? 'pointer' : 'default',
                        '&:hover': canManagePaymentStatus ? { opacity: 0.8 } : {}
                    }}
                />
            </TableCell>

            {/* Действия */}
            <TableCell sx={{ width: columnWidths.actions }}>
                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'nowrap' }}>
                    <IconButton title="Повторить платёж" onClick={() => onRepeat(payment)} size="small">
                        <Replay fontSize="small" />
                    </IconButton>
                    <IconButton
                        title={payment.payment_status === 'paid' && !isAdmin ? "Оплаченные платежи может редактировать только администратор" : "Редактировать"}
                        onClick={() => onEdit(payment)}
                        size="small"
                        disabled={payment.payment_status === 'paid' && !isAdmin}
                    >
                        <Edit fontSize="small" />
                    </IconButton>
                    <IconButton
                        title={payment.payment_status === 'paid' && !isAdmin ? "Оплаченные платежи может удалять только администратор" : "Удалить"}
                        onClick={() => onDelete(payment)}
                        size="small"
                        color="error"
                        disabled={payment.payment_status === 'paid' && !isAdmin}
                    >
                        <Delete fontSize="small" />
                    </IconButton>
                </Box>
            </TableCell>
        </TableRow>
    );
});

PaymentRow.displayName = 'PaymentRow';

// Inner virtualized content component (same pattern as VirtualizedTimeTable)
function VirtualizedContent({
    payments,
    onEdit,
    onDelete,
    onRepeat,
    onToggleStatus,
    canManagePaymentStatus,
    currencies,
    isAdmin,
    columnWidths,
    parentRef
}) {
    const virtualizerOptions = useMemo(() => ({
        count: payments.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 10
    }), [payments.length, parentRef]);

    const virtualizer = useVirtualizer(virtualizerOptions);
    const virtualItems = virtualizer.getVirtualItems();

    if (payments.length === 0) {
        return (
            <TableRow>
                <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">Нет данных для отображения</Typography>
                </TableCell>
            </TableRow>
        );
    }

    const totalSize = virtualizer.getTotalSize();
    const firstItem = virtualItems[0];
    const lastItem = virtualItems[virtualItems.length - 1];

    return (
        <>
            {/* Top spacer */}
            {firstItem && firstItem.start > 0 && (
                <tr style={{ height: firstItem.start }} />
            )}

            {virtualItems.map((virtualRow) => {
                const payment = payments[virtualRow.index];
                if (!payment) return null;

                return (
                    <PaymentRow
                        key={payment.id}
                        payment={payment}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onRepeat={onRepeat}
                        onToggleStatus={onToggleStatus}
                        canManagePaymentStatus={canManagePaymentStatus}
                        currencies={currencies}
                        isAdmin={isAdmin}
                        columnWidths={columnWidths}
                    />
                );
            })}

            {/* Bottom spacer */}
            {lastItem && (
                <tr style={{ height: totalSize - lastItem.end }} />
            )}
        </>
    );
}

// Default column widths (same as original PaymentsPage)
const DEFAULT_COLUMN_WIDTHS = {
    tracking_nr: 55,
    payment_date: 'auto',
    payer: 120,
    recipient: 100,
    amount: 'auto',
    category: 100,
    description: 200,
    assignment: 'auto',
    status: 130,
    actions: 130
};

// Main virtualized table component
function VirtualizedPaymentsTable({
    payments,
    onEdit,
    onDelete,
    onRepeat,
    onToggleStatus,
    canManagePaymentStatus,
    currencies,
    isAdmin,
    sortField,
    sortDirection,
    onSort,
    renderHeaderCell,
    columnWidths = DEFAULT_COLUMN_WIDTHS,
    loading
}) {
    const parentRef = useRef(null);

    if (loading) {
        return null;
    }

    return (
        <Box
            ref={parentRef}
            sx={{
                maxHeight: 'calc(100vh - 400px)',
                minHeight: 400,
                overflowY: 'auto',
                overflowX: 'hidden'
            }}
        >
            <Table size="small" sx={{ tableLayout: 'fixed' }}>
                <TableHead sx={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: '#f5f5f5' }}>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                        {renderHeaderCell('tracking_nr', '№', 'left', 'tracking_nr', { px: 0.5 })}
                        {renderHeaderCell('payment_date', 'Когда', 'left', 'payment_date')}
                        {renderHeaderCell('payer', 'От кого', 'left', 'payer')}
                        {renderHeaderCell('recipient', 'Кому', 'left', 'recipient')}
                        {renderHeaderCell('amount', 'Сумма', 'left', 'amount')}
                        {renderHeaderCell('category', 'Категория', 'left', 'category')}
                        {renderHeaderCell('description', 'Комментарий', 'left', 'description')}
                        {renderHeaderCell('assignment', 'Смена', 'center', 'assignment_tracking_nr')}
                        {renderHeaderCell('status', 'Статус', 'left', 'payment_status')}
                        {renderHeaderCell('actions', 'Действия', 'left', null)}
                    </TableRow>
                </TableHead>
                <TableBody>
                    <VirtualizedContent
                        payments={payments}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onRepeat={onRepeat}
                        onToggleStatus={onToggleStatus}
                        canManagePaymentStatus={canManagePaymentStatus}
                        currencies={currencies}
                        isAdmin={isAdmin}
                        columnWidths={columnWidths}
                        parentRef={parentRef}
                    />
                </TableBody>
            </Table>
        </Box>
    );
}

export default VirtualizedPaymentsTable;
