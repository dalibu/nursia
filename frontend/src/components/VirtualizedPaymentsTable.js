import React, { useRef, memo, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { alpha } from '@mui/material/styles';
import {
  Table, TableBody, TableCell, TableHead, TableRow,
  Box, IconButton, Chip, Tooltip, Typography, Checkbox, Paper
} from '@mui/material';
import { Edit, Delete, Replay, Payment } from '@mui/icons-material';
import { formatDate, formatTimeWithSeconds } from '../utils/dateFormat';

const ROW_HEIGHT = 53;

const PaymentRow = memo(({
  payment,
  onEdit,
  onDelete,
  onRepeat,
  onToggleStatus,
  canManagePaymentStatus,
  currencies,
  isAdmin,
  columnWidths,
  isSelected,
  onToggleSelect
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const symbol = currencies.find(c => c.code === payment.currency)?.symbol || payment.currency;

  return (
    <TableRow
      hover
      sx={{
        '& td': { verticalAlign: 'middle' },
        backgroundColor: (theme) =>
          isSelected
            ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.22 : 0.12)
            : 'inherit'
      }}
    >
      {isAdmin && (
        <TableCell sx={{ width: 30, minWidth: 30, p: 1, textAlign: 'center' }}>
          <Checkbox
            size="small"
            checked={isSelected}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onToggleSelect(payment.id, e)}
            sx={{ p: 0.25 }}
          />
        </TableCell>
      )}

      <TableCell sx={{ width: columnWidths.tracking_nr, minWidth: columnWidths.tracking_nr, px: 0.5, fontSize: '0.75rem' }}>
        {payment.tracking_nr || '-'}
      </TableCell>

      <TableCell sx={{ width: columnWidths.payment_date }}>
        <Tooltip
          title={
            <div>
              <div>{t('payments.createdAt')}: {formatDate(payment.created_at)} {formatTimeWithSeconds(payment.created_at)}</div>
              {payment.modified_at && (
                <div>
                  {t('payments.modifiedAt')}: {formatDate(payment.modified_at)} {formatTimeWithSeconds(payment.modified_at)}
                </div>
              )}
            </div>
          }
          arrow
          placement="top"
        >
          <Box sx={{ lineHeight: 1, cursor: 'help' }}>
            {payment.modified_at ? (
              <>
                <div>{formatDate(payment.modified_at)}</div>
                <div style={{ fontSize: '0.85em' }}>{formatTimeWithSeconds(payment.modified_at)}</div>
              </>
            ) : (
              <>
                <div>{formatDate(payment.payment_date)}</div>
                <Box component="div" sx={{ fontSize: '0.85em' }}>
                  {formatTimeWithSeconds(payment.payment_date)}
                </Box>
              </>
            )}
          </Box>
        </Tooltip>
      </TableCell>

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

      <TableCell sx={{ whiteSpace: 'nowrap', width: columnWidths.amount }}>
        {payment.amount} {symbol}
      </TableCell>

      <TableCell sx={{ width: columnWidths.category }}>
        {['Аванс', 'Долг'].includes(payment.category?.name)
          ? (
            <Chip
              label={payment.category.name}
              size="small"
              sx={{ backgroundColor: '#FFEB3B', color: '#000' }}
            />
          )
          : (payment.category?.name || '-')}
      </TableCell>

      <Tooltip title={payment.description || ''} arrow placement="top">
        <TableCell sx={{ width: columnWidths.description, maxWidth: columnWidths.description, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {payment.description || '-'}
        </TableCell>
      </Tooltip>

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

      <TableCell sx={{ width: columnWidths.status }}>
        <Chip
          label={
            payment.payment_status === 'paid' ? t('payments.statusPaid') :
              payment.payment_status === 'offset' ? t('payments.statusOffset') :
                t('payments.statusUnpaid')
          }
          color={
            payment.payment_status === 'paid' ? 'success' :
              payment.payment_status === 'offset' ? 'info' :
                'warning'
          }
          size="small"
          clickable={canManagePaymentStatus}
          onClick={canManagePaymentStatus ? () => {
            const nextStatus =
              payment.payment_status === 'unpaid' ? 'paid' :
                payment.payment_status === 'paid' ? 'offset' :
                  'unpaid';
            onToggleStatus(payment.id, nextStatus);
          } : undefined}
          icon={<Payment />}
          sx={{
            cursor: canManagePaymentStatus ? 'pointer' : 'default',
            '&:hover': canManagePaymentStatus ? { opacity: 0.8 } : {}
          }}
        />
      </TableCell>

      <TableCell sx={{ width: columnWidths.actions }}>
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'nowrap' }}>
          <IconButton title={t('payments.repeatPayment')} onClick={() => onRepeat(payment)} size="small">
            <Replay fontSize="small" />
          </IconButton>
          <IconButton
            title={payment.payment_status === 'paid' && !isAdmin ? t('payments.paidEditAdminOnly') : t('common.edit')}
            onClick={() => onEdit(payment)}
            size="small"
            disabled={payment.payment_status === 'paid' && !isAdmin}
          >
            <Edit fontSize="small" />
          </IconButton>
          <IconButton
            title={payment.payment_status === 'paid' && !isAdmin ? t('payments.paidDeleteAdminOnly') : t('common.delete')}
            onClick={() => onDelete(payment)}
            size="small"
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
  parentRef,
  selectedIds,
  onToggleSelect
}) {
  const { t } = useTranslation();
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
        <TableCell colSpan={isAdmin ? 11 : 10} align="center" sx={{ py: 4, borderBottom: 'none' }}>
          <Typography color="text.secondary">{t('payments.noData')}</Typography>
        </TableCell>
      </TableRow>
    );
  }

  const totalSize = virtualizer.getTotalSize();
  const firstItem = virtualItems.at(0);
  const lastItem = virtualItems.at(-1);

  return (
    <>
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
            isSelected={selectedIds?.has(payment.id)}
            onToggleSelect={onToggleSelect}
          />
        );
      })}

      {lastItem && (
        <tr style={{ height: totalSize - lastItem.end }} />
      )}
    </>
  );
}

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

function VirtualizedPaymentsTable({
  payments,
  onEdit,
  onDelete,
  onRepeat,
  onToggleStatus,
  canManagePaymentStatus,
  currencies,
  isAdmin,
  renderHeaderCell,
  columnWidths = DEFAULT_COLUMN_WIDTHS,
  loading,
  selectedIds,
  onToggleSelect,
  onSelectAll
}) {
  const { t } = useTranslation();
  const parentRef = useRef(null);

  if (loading) {
    return null;
  }

  const headerBgColor = (theme) => (theme.palette.mode === 'dark' ? '#334155' : '#e2e8f0');

  return (
    <Paper sx={{ py: 0, px: 0 }}>
      <Box
        ref={parentRef}
        sx={{
          maxHeight: 'calc(100vh - 400px)',
          minHeight: 400,
          overflowY: 'auto',
          overflowX: 'auto'
        }}
      >
        <Table size="small" sx={{ tableLayout: 'fixed', width: '100%', minWidth: 1000 }}>
          <TableHead sx={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: headerBgColor }}>
            <TableRow sx={{ backgroundColor: headerBgColor }}>
              {isAdmin && (
                <TableCell sx={{ width: 30, minWidth: 30, p: 1, textAlign: 'center', backgroundColor: headerBgColor }}>
                  <Checkbox
                    size="small"
                    checked={selectedIds?.size === payments.length && payments.length > 0}
                    indeterminate={selectedIds?.size > 0 && selectedIds?.size < payments.length}
                    onChange={onSelectAll}
                    sx={{ p: 0.25 }}
                  />
                </TableCell>
              )}
              {renderHeaderCell('tracking_nr', t('payments.colNumber'), 'left', 'tracking_nr', { px: 0.5 })}
              {renderHeaderCell('payment_date', t('payments.colWhen'), 'left', 'payment_date')}
              {renderHeaderCell('payer', t('payments.colFrom'), 'left', 'payer')}
              {renderHeaderCell('recipient', t('payments.colTo'), 'left', 'recipient')}
              {renderHeaderCell('amount', t('payments.colAmount'), 'left', 'amount')}
              {renderHeaderCell('category', t('payments.colCategory'), 'left', 'category')}
              {renderHeaderCell('description', t('payments.colComment'), 'left', 'description')}
              {renderHeaderCell('assignment', t('payments.colShift'), 'center', 'assignment_tracking_nr')}
              {renderHeaderCell('status', t('payments.colStatus'), 'center', 'payment_status')}
              {renderHeaderCell('actions', t('common.actions'), 'left', null)}
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
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
            />
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
}

export default VirtualizedPaymentsTable;
