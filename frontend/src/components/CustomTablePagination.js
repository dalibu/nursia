import React from 'react';
import { TablePagination } from '@mui/material';
import { useTranslation } from 'react-i18next';

function CustomTablePagination({ isFiltered = false, totalCount, ...props }) {
  const { t } = useTranslation();

  return (
    <TablePagination
      component="div"
      labelRowsPerPage={t('common.rowsPerPage')}
      labelDisplayedRows={({ from, to, count }) => {
        const base = `${from}–${to} / ${count}`;
        if (isFiltered && totalCount !== undefined) {
          return `${base} (${t('common.filteredFrom', { total: totalCount })})`;
        }
        return base;
      }}
      {...props}
    />
  );
}

export default CustomTablePagination;
