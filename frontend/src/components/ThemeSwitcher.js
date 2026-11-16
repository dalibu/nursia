import React from 'react';
import { useTranslation } from 'react-i18next';
import { Select, MenuItem, Box } from '@mui/material';
import { useTheme } from '../contexts/ThemeContext';
import { THEME_LIST } from '../config/themes';

function ThemeSwitcher() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  const currentTheme = THEME_LIST.some((item) => item.id === theme) ? theme : 'light';

  return (
    <Select
      size="small"
      value={currentTheme}
      onChange={(e) => setTheme(e.target.value)}
      renderValue={(selected) => {
        const item = THEME_LIST.find((i) => i.id === selected) || THEME_LIST.at(0);
        return (
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {item.icon}
          </Box>
        );
      }}
      sx={{
        minWidth: 56,
        height: 36,
        borderRadius: 2,
        '& .MuiSelect-select': {
          py: 0.5,
          px: 1.25,
          display: 'flex',
          alignItems: 'center'
        }
      }}
    >
      {THEME_LIST.map((item) => (
        <MenuItem key={item.id} value={item.id}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            {item.icon}
            <span>{t(item.labelKey)}</span>
          </Box>
        </MenuItem>
      ))}
    </Select>
  );
}

export default ThemeSwitcher;
