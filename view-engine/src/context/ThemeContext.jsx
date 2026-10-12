import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export const ACCENT_PRESETS = {
  blue: {
    id: 'blue',
    label: 'Slate Blue',
    primary: '#2563eb',
    hover: '#1d4ed8',
    light: '#eff6ff',
    border: '#bfdbfe',
    ring: 'rgba(37, 99, 235, 0.25)',
  },
  emerald: {
    id: 'emerald',
    label: 'Emerald',
    primary: '#059669',
    hover: '#047857',
    light: '#ecfdf5',
    border: '#a7f3d0',
    ring: 'rgba(5, 150, 105, 0.25)',
  },
  violet: {
    id: 'violet',
    label: 'Violet',
    primary: '#7c3aed',
    hover: '#6d28d9',
    light: '#f5f3ff',
    border: '#ddd6fe',
    ring: 'rgba(124, 58, 237, 0.25)',
  },
  slate: {
    id: 'slate',
    label: 'Slate',
    primary: '#334155',
    hover: '#1e293b',
    light: '#f1f5f9',
    border: '#cbd5e1',
    ring: 'rgba(51, 65, 85, 0.25)',
  },
};

export const FONT_SCALE_PRESETS = [
  { id: '100%', label: 'Standard (100%)', scale: 1.0 },
  { id: '110%', label: 'Medium (110%)', scale: 1.1 },
  { id: '120%', label: 'Large (120%)', scale: 1.2 },
  { id: '130%', label: 'Accessible (130%)', scale: 1.3 },
];

export function ThemeProvider({ children }) {
  const [themePrefs, setThemePrefs] = useState(() => {
    const saved = localStorage.getItem('user_theme_preferences');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    // Also check user_preferences from Task 1
    const userPrefs = localStorage.getItem('user_preferences');
    let fallbackAccent = 'blue';
    if (userPrefs) {
      try {
        const parsed = JSON.parse(userPrefs);
        if (parsed.accentColor) fallbackAccent = parsed.accentColor;
      } catch (e) {
        console.error(e);
      }
    }

    return {
      themeMode: 'light', // 'light' | 'dark' | 'system'
      accentColor: fallbackAccent, // 'blue' | 'emerald' | 'violet' | 'slate'
      fontScale: '100%', // '100%' | '110%' | '120%' | '130%'
    };
  });

  const [systemIsDark, setSystemIsDark] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Listen to system color scheme changes
  useEffect(() => {
    if (!window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setSystemIsDark(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const effectiveTheme = themePrefs.themeMode === 'system'
    ? (systemIsDark ? 'dark' : 'light')
    : themePrefs.themeMode;

  // Apply Theme & Dark mode class to document
  useEffect(() => {
    const root = document.documentElement;
    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [effectiveTheme]);

  // Apply CSS Variables for dynamic accent color & user-level font scale
  useEffect(() => {
    const root = document.documentElement;
    const accent = ACCENT_PRESETS[themePrefs.accentColor] || ACCENT_PRESETS.blue;
    root.style.setProperty('--primary-color', accent.primary);
    root.style.setProperty('--primary-hover', accent.hover);
    root.style.setProperty('--primary-light', accent.light);
    root.style.setProperty('--primary-border', accent.border);
    root.style.setProperty('--primary-ring', accent.ring);

    const scaleObj = FONT_SCALE_PRESETS.find((f) => f.id === themePrefs.fontScale) || FONT_SCALE_PRESETS[0];
    root.style.setProperty('--app-font-scale', String(scaleObj.scale));

    // Save to localStorage
    localStorage.setItem('user_theme_preferences', JSON.stringify(themePrefs));

    // Synchronize to user_preferences if it exists
    const existingUserPrefs = localStorage.getItem('user_preferences');
    if (existingUserPrefs) {
      try {
        const parsed = JSON.parse(existingUserPrefs);
        parsed.accentColor = themePrefs.accentColor;
        parsed.themeMode = themePrefs.themeMode;
        parsed.fontScale = themePrefs.fontScale;
        localStorage.setItem('user_preferences', JSON.stringify(parsed));
      } catch (e) {
        console.error(e);
      }
    }
  }, [themePrefs]);

  const setThemeMode = (mode) => {
    setThemePrefs((prev) => ({ ...prev, themeMode: mode }));
  };

  const setAccentColor = (color) => {
    setThemePrefs((prev) => ({ ...prev, accentColor: color }));
  };

  const setFontScale = (scale) => {
    setThemePrefs((prev) => ({ ...prev, fontScale: scale }));
  };

  const updateThemePreferences = (newPrefs) => {
    setThemePrefs((prev) => ({ ...prev, ...newPrefs }));
  };

  const currentAccent = ACCENT_PRESETS[themePrefs.accentColor] || ACCENT_PRESETS.blue;

  return (
    <ThemeContext.Provider
      value={{
        themeMode: themePrefs.themeMode,
        effectiveTheme,
        accentColor: themePrefs.accentColor,
        currentAccent,
        fontScale: themePrefs.fontScale,
        setThemeMode,
        setAccentColor,
        setFontScale,
        updateThemePreferences,
        accentPresets: ACCENT_PRESETS,
        fontScalePresets: FONT_SCALE_PRESETS,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
