import React, { createContext, useContext, useState, useEffect } from 'react';
import { THEMES } from '../config/themes';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved && THEMES[saved]) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const themeConfig = THEMES[theme] || THEMES.light;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeConfig.id);
    localStorage.setItem('theme', themeConfig.id);

    Object.entries(themeConfig.cssVars).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
  }, [themeConfig]);

  const setSpecificTheme = (newTheme) => {
    if (THEMES[newTheme]) {
      setTheme(newTheme);
    }
  };

  const toggleTheme = () => {
    setSpecificTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme: themeConfig.id, themeConfig, toggleTheme, setTheme: setSpecificTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
