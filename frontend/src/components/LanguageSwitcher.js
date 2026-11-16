import React from 'react';
import { useTranslation } from 'react-i18next';
import { Select, MenuItem, Box } from '@mui/material';

const FlagIcon = ({ code }) => {
  const style = {
    width: 20,
    height: 14,
    borderRadius: '2px',
    flexShrink: 0,
    boxShadow: '0 0 1px rgba(0,0,0,0.4)'
  };

  switch (code) {
    case 'uk':
      return (
        <svg viewBox="0 0 3 2" style={style}>
          <rect width="3" height="1" y="0" fill="#0057B7" />
          <rect width="3" height="1" y="1" fill="#FFD700" />
        </svg>
      );
    case 'ru':
      return (
        <svg viewBox="0 0 3 2" style={style}>
          <rect width="3" height="0.67" y="0" fill="#FFFFFF" />
          <rect width="3" height="0.67" y="0.67" fill="#0039A6" />
          <rect width="3" height="0.67" y="1.33" fill="#D52B1E" />
        </svg>
      );
    case 'de':
      return (
        <svg viewBox="0 0 5 3" style={style}>
          <rect width="5" height="1" y="0" fill="#000000" />
          <rect width="5" height="1" y="1" fill="#DD0000" />
          <rect width="5" height="1" y="2" fill="#FFCE00" />
        </svg>
      );
    case 'en':
    default:
      return (
        <svg viewBox="0 0 60 30" style={style}>
          <rect width="60" height="30" fill="#012169" />
          <path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFFFFF" strokeWidth="6" />
          <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="3" />
          <path d="M30,0 V30 M0,15 H60" stroke="#FFFFFF" strokeWidth="10" />
          <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" strokeWidth="6" />
        </svg>
      );
  }
};

const LANGUAGES = [
  { code: 'uk', short: 'UA', label: 'Українська' },
  { code: 'ru', short: 'RU', label: 'Русский' },
  { code: 'de', short: 'DE', label: 'Deutsch' },
  { code: 'en', short: 'EN', label: 'English' }
];

function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const currentLang = LANGUAGES.some((l) => l.code === i18n.language) ? i18n.language : 'uk';

  return (
    <Select
      size="small"
      value={currentLang}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      renderValue={(selected) => {
        const lang = LANGUAGES.find((l) => l.code === selected) || LANGUAGES.at(0);
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontWeight: 600, fontSize: '0.85rem' }}>
            <FlagIcon code={lang.code} />
            <span>{lang.short}</span>
          </Box>
        );
      }}
      sx={{
        minWidth: 88,
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
      {LANGUAGES.map((lang) => (
        <MenuItem key={lang.code} value={lang.code}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <FlagIcon code={lang.code} />
            <span>{lang.label}</span>
          </Box>
        </MenuItem>
      ))}
    </Select>
  );
}

export default LanguageSwitcher;
