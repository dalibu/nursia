import React from 'react';
import { useTranslation } from 'react-i18next';
import { Select, MenuItem, Box } from '@mui/material';
import { LightMode, DarkMode } from '@mui/icons-material';
import { useTheme } from '../contexts/ThemeContext';

const THEMES = [
  { id: 'light', labelKey: 'nav.lightTheme', icon: <LightMode fontSize="small" sx={{ color: '#f59e0b' }} /> },
  { id: 'dark', labelKey: 'nav.darkTheme', icon: <DarkMode fontSize="small" sx={{ color: '#60a5fa' }} /> }
  // В будущем новые темы достаточно добавить одной строкой сюда:
  // { id: 'emerald', labelKey: 'nav.emeraldTheme', icon: <Palette fontSize="small" sx={{ color: '#10b981' }} /> }
];

function ThemeSwitcher() {
  const { t } = useTranslation();
  const { theme, toggleTheme, setTheme } = useTheme();

  const currentTheme = THEMES.some((item) => item.id === theme) ? theme : 'light';

  const handleChange = (e) => {
    const nextTheme = e.target.value;
    if (setTheme) {
      setTheme(nextTheme);
    } else if (nextTheme !== theme && toggleTheme) {
      toggleTheme();
    }
  };

  return (
    <Select
      size="small"
      value={currentTheme}
      onChange={handleChange}
      renderValue={(selected) => {
        const item = THEMES.find((i) => i.id === selected) || THEMES.at(0);
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
      {THEMES.map((item) => (
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
