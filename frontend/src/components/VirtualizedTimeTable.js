import React, { useRef, memo, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Box, IconButton, Chip, Collapse, Tooltip, Typography, Checkbox
} from '@mui/material';
import {
    PlayArrow, Stop, Edit, Delete, Pause, Coffee,
    KeyboardArrowDown, KeyboardArrowUp, Add, Replay, Work, BeachAccess, Sick, EventBusy, MoneyOff
} from '@mui/icons-material';
import { formatDate as formatDateUtil, formatTime as formatTimeUtil } from '../utils/dateFormat';

// Assignment type icon and color configuration
const ASSIGNMENT_TYPE_ICONS = {
    work: { icon: Work, color: '#4caf50' },
    sick_leave: { icon: Sick, color: '#f44336' },
    vacation: { icon: BeachAccess, color: '#2196f3' },
    day_off: { icon: EventBusy, color: '#ff9800' },
    unpaid_leave: { icon: MoneyOff, color: '#9e9e9e' }
};

const ROW_HEIGHT = 53;

// Memoized row component for performance
const AssignmentRow = memo(({
    assignment,
    isExpanded,
    onToggleExpand,
    onPauseResume,
    onStop,
    onNewTask,
    onClone,
    onEdit,
    onDelete,
    onEditSegment,
    onDeleteSegment,
    onNavigateToPayment,
    formatDate,
    formatTime,
    LiveTimer,
    currentTime,
    assignmentTypes,
    columnWidths,
    // Bulk selection props
    isAdmin,
    isSelected,
    onToggleSelect
}) => {
    const iconConfig = ASSIGNMENT_TYPE_ICONS[assignment.assignment_type || 'work'];
    const typeData = assignmentTypes?.find(t => t.value === assignment.assignment_type) || { label: 'Смена' };
    const Icon = iconConfig?.icon || Work;
    const hasSegments = assignment.segments && assignment.segments.length > 0;

    // Find active segment for pause/resume state
    const activeSegment = assignment.segments?.find(s => !s.end_time);
    const isPaused = activeSegment?.session_type === 'pause';

    // Can select: admin only, non-active, non-paid
    const canSelect = isAdmin && !assignment.is_active && assignment.payment_status !== 'paid';

    return (
        <>
            {/* Main assignment row */}
            <TableRow
                sx={{
                    '&:hover': { backgroundColor: '#f9f9f9' },
                    cursor: hasSegments ? 'pointer' : 'default',
                    backgroundColor: assignment.is_active ? '#e8f5e9' : (isSelected ? '#e3f2fd' : 'inherit')
                }}
                onClick={() => hasSegments && onToggleExpand(assignment.assignment_id)}
            >
                {/* Checkbox column for bulk selection (admin only) */}
                {isAdmin && (
                    <TableCell sx={{ width: 30, minWidth: 30, p: 1, textAlign: 'center' }}>
                        {canSelect ? (
                            <Checkbox
                                size="small"
                                checked={isSelected}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => onToggleSelect(assignment.assignment_id, e)}
                                sx={{ p: 0.25 }}
                            />
                        ) : null}
                    </TableCell>
                )}
                {/* Номер с accordion */}
                <TableCell sx={{ width: columnWidths.tracking_nr || 70, minWidth: 60, px: 0.5, fontSize: '0.75rem' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Box sx={{ width: 24, minWidth: 24, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                            {hasSegments && (
                                <IconButton size="small" onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleExpand(assignment.assignment_id);
                                }}>
                                    {isExpanded ? <KeyboardArrowUp fontSize="small" /> : <KeyboardArrowDown fontSize="small" />}
                                </IconButton>
                            )}
                        </Box>
                        <span>{assignment.tracking_nr || '-'}</span>
                    </Box>
                </TableCell>
                <TableCell padding="none" sx={{ pl: 1, whiteSpace: 'nowrap', width: columnWidths.date }} title={`Начало: ${formatTimeUtil(assignment.start_time)} ${formatDateUtil(assignment.start_time)}\nОкончание: ${formatTimeUtil(assignment.end_time)} ${formatDateUtil(assignment.end_time)}`}>
                    {(() => {
                        const dateStr = formatDate(assignment.assignment_date);

                        // Check for multi-day range
                        if (assignment.start_time && assignment.end_time) {
                            const start = new Date(assignment.start_time);
                            const end = new Date(assignment.end_time);

                            // Use local date components to avoid UTC shift
                            const toLocalYMD = (d) => {
                                const year = d.getFullYear();
                                const month = String(d.getMonth() + 1).padStart(2, '0');
                                const day = String(d.getDate()).padStart(2, '0');
                                return `${year}-${month}-${day}`;
                            };

                            const startD = toLocalYMD(start);
                            const endD = toLocalYMD(end);

                            if (startD !== endD) {
                                const [startY, startM, startDay] = startD.split('-');
                                const [endY, endM, endDay] = endD.split('-');

                                // Compact format: if same year, show DD.MM-DD.MM.YYYY
                                if (startY === endY) {
                                    return `${startDay}.${startM}-${endDay}.${endM}.${startY}`;
                                } else {
                                    // Different years: show full dates
                                    return `${startDay}.${startM}.${startY}-${endDay}.${endM}.${endY}`;
                                }
                            }
                        }
                        return dateStr;
                    })()}
                </TableCell>
                <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: columnWidths.worker }} title={assignment.worker_name}>
                    {assignment.worker_name}
                </TableCell>
                <TableCell sx={{ width: columnWidths.type }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Icon sx={{ fontSize: 16, color: iconConfig?.color || '#666' }} />
                        <span style={{ color: iconConfig?.color || '#666' }}>
                            {typeData.label}
                        </span>
                    </Box>
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap', width: columnWidths.time }}>
                    {assignment.assignment_type && assignment.assignment_type !== 'work'
                        ? '—'
                        : `${formatTime(assignment.start_time)} — ${assignment.end_time ? formatTime(assignment.end_time) : '...'}`
                    }
                </TableCell>
                <TableCell sx={{ width: columnWidths.duration, whiteSpace: 'nowrap' }}>
                    {assignment.assignment_type === 'work' || !assignment.assignment_type ? (
                        <LiveTimer assignment={assignment} currentTime={currentTime} />
                    ) : (
                        <span style={{ color: '#666' }}>—</span>
                    )}
                </TableCell>
                <Tooltip title={assignment.description || ''} arrow placement="top">
                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: columnWidths.description, pl: 2 }}>
                        {assignment.description || '—'}
                    </TableCell>
                </Tooltip>
                <TableCell align="center" sx={{ width: columnWidths.payment }}>
                    {assignment.payment_tracking_nr ? (
                        <Chip
                            label={assignment.payment_tracking_nr}
                            size="small"
                            color={assignment.payment_status === 'paid' ? "success" : "warning"}
                            clickable
                            onClick={(e) => {
                                e.stopPropagation();
                                onNavigateToPayment(assignment.payment_tracking_nr);
                            }}
                            sx={{ cursor: 'pointer' }}
                        />
                    ) : (
                        <Typography variant="caption" color="text.secondary">—</Typography>
                    )}
                </TableCell>
                <TableCell align="center" sx={{ width: columnWidths.status }}>
                    {assignment.is_active ? (
                        isPaused ? (
                            <Chip
                                icon={<Coffee sx={{ fontSize: '1rem !important' }} />}
                                label="Пауза"
                                color="warning"
                                size="small"
                            />
                        ) : (
                            <Chip label="В работе" color="warning" size="small" />
                        )
                    ) : (
                        <Chip label="Готово" color="success" size="small" />
                    )}
                </TableCell>
                <TableCell sx={{ width: columnWidths.actions }}>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-start', gap: 0.5 }}>
                        {/* Session control buttons for active sessions */}
                        {assignment.is_active && (
                            <>
                                <Tooltip title={isPaused ? 'Продолжить' : 'Пауза'}>
                                    <IconButton
                                        size="small"
                                        onClick={(e) => onPauseResume(assignment, e)}
                                        sx={{ color: isPaused ? 'success.main' : 'warning.main' }}
                                    >
                                        {isPaused ? <PlayArrow fontSize="small" /> : <Pause fontSize="small" />}
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Завершить">
                                    <IconButton
                                        size="small"
                                        onClick={(e) => onStop(assignment, e)}
                                        sx={{ color: 'error.main' }}
                                    >
                                        <Stop fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Новое задание">
                                    <IconButton
                                        size="small"
                                        onClick={(e) => onNewTask(assignment, e)}
                                        sx={{ color: 'primary.main' }}
                                    >
                                        <Add fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            </>
                        )}
                        <Tooltip title="Клонировать">
                            <IconButton size="small" onClick={(e) => onClone(assignment, e)}>
                                <Replay fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Редактировать">
                            <IconButton size="small" onClick={(e) => onEdit(assignment, e)}>
                                <Edit fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        {!assignment.is_active && (
                            <Tooltip title="Удалить">
                                <IconButton size="small" onClick={(e) => onDelete(assignment, e)}>
                                    <Delete fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Box>
                </TableCell>
            </TableRow>

            {/* Expandable segments */}
            {hasSegments && (
                <TableRow>
                    <TableCell colSpan={9} sx={{ p: 0, border: 0 }}>
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                            <Box sx={{ m: 1, ml: 6, backgroundColor: '#fafafa', borderRadius: 1, p: 1 }}>
                                <Table size="small">
                                    <TableBody>
                                        {assignment.segments.map((seg) => (
                                            <TableRow key={seg.id} sx={{
                                                backgroundColor: seg.session_type === 'pause' ? '#fff3e0' : (seg.session_type === 'absent' ? '#e3f2fd' : '#e8f5e9')
                                            }}>
                                                <TableCell width={80}>
                                                    <Chip
                                                        label={seg.session_type === 'pause' ? 'Пауза' : (seg.session_type === 'absent' ? 'Отсутств.' : 'Работа')}
                                                        size="small"
                                                        sx={{
                                                            backgroundColor: seg.session_type === 'pause' ? '#ff9800' : (seg.session_type === 'absent' ? '#2196f3' : '#4caf50'),
                                                            color: 'white'
                                                        }}
                                                    />
                                                </TableCell>

                                                {/* Date column (for multi-day assignments) */}
                                                <TableCell width={100} sx={{ color: '#555', fontWeight: 500 }}>
                                                    {(() => {
                                                        if (assignment.start_time && assignment.end_time) {
                                                            const assignStart = new Date(assignment.start_time);
                                                            const assignEnd = new Date(assignment.end_time);
                                                            const isMultiDay = assignStart.getDate() !== assignEnd.getDate() ||
                                                                assignStart.getMonth() !== assignEnd.getMonth() ||
                                                                assignStart.getFullYear() !== assignEnd.getFullYear();

                                                            if (isMultiDay) {
                                                                return formatDateUtil(seg.start_time);
                                                            }
                                                        }
                                                        return '';
                                                    })()}
                                                </TableCell>

                                                <TableCell>{formatTimeUtil(seg.start_time)} — {seg.end_time ? formatTimeUtil(seg.end_time) : 'сейчас'}</TableCell>
                                                <TableCell>
                                                    {seg.duration_hours ? (
                                                        (() => {
                                                            const totalMinutes = Math.round(seg.duration_hours * 60);
                                                            const h = Math.floor(totalMinutes / 60);
                                                            const m = totalMinutes % 60;
                                                            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                                                        })()
                                                    ) : '—'}
                                                </TableCell>
                                                <TableCell sx={{ fontStyle: 'italic', color: '#666' }}>
                                                    {seg.description || ''}
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Tooltip title="Редактировать">
                                                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); onEditSegment(seg); }}>
                                                            <Edit fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Удалить">
                                                        <IconButton size="small" onClick={(e) => onDeleteSegment(seg.id, e)}>
                                                            <Delete fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </Box>
                        </Collapse>
                    </TableCell>
                </TableRow>
            )}
        </>
    );
});

AssignmentRow.displayName = 'AssignmentRow';

// Inner virtualized content component
function VirtualizedContent({
    assignments,
    expandedRows,
    onToggleExpand,
    onPauseResume,
    onStop,
    onNewTask,
    onClone,
    onEdit,
    onDelete,
    onEditSegment,
    onDeleteSegment,
    onNavigateToPayment,
    formatDate,
    formatTime,
    LiveTimer,
    currentTime,
    assignmentTypes,
    columnWidths,
    parentRef,
    // Bulk selection props
    isAdmin,
    selectedIds,
    onToggleSelect
}) {
    // Memoize virtualizer options to prevent re-creation
    const virtualizerOptions = useMemo(() => ({
        count: assignments.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 10
    }), [assignments.length, parentRef]);

    const virtualizer = useVirtualizer(virtualizerOptions);
    const virtualItems = virtualizer.getVirtualItems();

    if (assignments.length === 0) {
        return (
            <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">Нет записей</Typography>
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
                const assignment = assignments[virtualRow.index];
                if (!assignment) return null;

                return (
                    <AssignmentRow
                        key={assignment.assignment_id}
                        assignment={assignment}
                        isExpanded={expandedRows[assignment.assignment_id]}
                        onToggleExpand={onToggleExpand}
                        onPauseResume={onPauseResume}
                        onStop={onStop}
                        onNewTask={onNewTask}
                        onClone={onClone}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onEditSegment={onEditSegment}
                        onDeleteSegment={onDeleteSegment}
                        onNavigateToPayment={onNavigateToPayment}
                        formatDate={formatDate}
                        formatTime={formatTime}
                        LiveTimer={LiveTimer}
                        currentTime={currentTime}
                        assignmentTypes={assignmentTypes}
                        columnWidths={columnWidths}
                        // Bulk selection props
                        isAdmin={isAdmin}
                        isSelected={selectedIds?.has(assignment.assignment_id)}
                        onToggleSelect={onToggleSelect}
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

// Main virtualized table component
function VirtualizedTimeTable({
    assignments,
    expandedRows,
    onToggleExpand,
    onPauseResume,
    onStop,
    onNewTask,
    onClone,
    onEdit,
    onDelete,
    onEditSegment,
    onDeleteSegment,
    onNavigateToPayment,
    formatDate,
    formatTime,
    formatCurrency,
    LiveTimer,
    currentTime,
    assignmentTypes,
    columnWidths,
    sortField,
    sortDirection,
    onSort,
    renderHeaderCell,
    loading,
    // Bulk selection props
    isAdmin,
    selectedIds,
    onToggleSelect,
    onSelectAll
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
                overflowX: 'auto'
            }}
        >
            <Table size="small" sx={{ tableLayout: 'fixed', minWidth: 1000 }}>
                <TableHead sx={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: '#f5f5f5' }}>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                        {/* Checkbox column header for admin */}
                        {isAdmin && (
                            <TableCell sx={{ width: 30, minWidth: 30, p: 1, textAlign: 'center', backgroundColor: '#f5f5f5' }}>
                                <Checkbox
                                    size="small"
                                    checked={selectedIds?.size > 0 && selectedIds?.size === assignments.filter(a => !a.is_active && a.payment_status !== 'paid').length}
                                    indeterminate={selectedIds?.size > 0 && selectedIds?.size < assignments.filter(a => !a.is_active && a.payment_status !== 'paid').length}
                                    onChange={onSelectAll}
                                    sx={{ p: 0.25 }}
                                />
                            </TableCell>
                        )}
                        {renderHeaderCell('tracking_nr', '№', 'left', 'tracking_nr', { px: 0.5 })}
                        {renderHeaderCell('date', 'Дата', 'left', 'assignment_date')}
                        {renderHeaderCell('worker', 'Исполнитель', 'left', 'worker_name')}
                        {renderHeaderCell('type', 'Тип', 'left', 'assignment_type')}
                        {renderHeaderCell('time', 'Время', 'left', 'total_work_seconds')}
                        {renderHeaderCell('duration', 'Продолж.', 'left', 'total_amount')}
                        {renderHeaderCell('description', 'Комментарий', 'left', 'description')}
                        {renderHeaderCell('payment', 'Платёж', 'left', 'payment_tracking_nr')}
                        {renderHeaderCell('status', 'Статус', 'left', 'is_active')}
                        {renderHeaderCell('actions', 'Действия', 'left', null)}
                    </TableRow>
                </TableHead>
                <TableBody>
                    <VirtualizedContent
                        assignments={assignments}
                        expandedRows={expandedRows}
                        onToggleExpand={onToggleExpand}
                        onPauseResume={onPauseResume}
                        onStop={onStop}
                        onNewTask={onNewTask}
                        onClone={onClone}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onEditSegment={onEditSegment}
                        onDeleteSegment={onDeleteSegment}
                        onNavigateToPayment={onNavigateToPayment}
                        formatDate={formatDate}
                        formatTime={formatTime}
                        LiveTimer={LiveTimer}
                        currentTime={currentTime}
                        assignmentTypes={assignmentTypes}
                        columnWidths={columnWidths}
                        parentRef={parentRef}
                        // Bulk selection props
                        isAdmin={isAdmin}
                        selectedIds={selectedIds}
                        onToggleSelect={onToggleSelect}
                    />
                </TableBody>
            </Table>
        </Box>
    );
}

export default VirtualizedTimeTable;
