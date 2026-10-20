import React, { createContext, useContext, useState, useEffect } from 'react';
import { TRANSLATIONS } from '../locales/translations';

const LocaleContext = createContext(null);

export function LocaleProvider({ children, initialPreferences = {} }) {
  const [preferences, setPreferences] = useState(() => {
    const saved = localStorage.getItem('user_preferences');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return {
      language: initialPreferences.language || 'en',
      direction: initialPreferences.direction || 'ltr',
      timezone: initialPreferences.timezone || 'Asia/Qatar',
      dateFormat: initialPreferences.dateFormat || 'DD/MM/YYYY',
      timeFormat: initialPreferences.timeFormat || '12h',
      accentColor: initialPreferences.accentColor || 'blue',
    };
  });

  // Keep HTML document dir and lang synchronized
  useEffect(() => {
    const dir = preferences.language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    document.documentElement.lang = preferences.language;
    if (preferences.language === 'ar') {
      document.body.style.fontFamily = "'Cairo', 'Inter', system-ui, sans-serif";
    } else {
      document.body.style.fontFamily = "'Inter', system-ui, sans-serif";
    }
  }, [preferences.language]);

  const updatePreferences = (newPrefs) => {
    setPreferences((prev) => {
      const updated = { ...prev, ...newPrefs };
      if (newPrefs.language) {
        updated.direction = newPrefs.language === 'ar' ? 'rtl' : 'ltr';
      }
      localStorage.setItem('user_preferences', JSON.stringify(updated));
      return updated;
    });
  };

  // Translation helper t(key)
  const t = (key) => {
    const lang = preferences.language || 'en';
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
    return dict[key] || TRANSLATIONS.en[key] || key;
  };

  // Date formatter according to user's date format
  const formatDate = (dateInput) => {
    if (!dateInput) return '—';
    try {
      const d = new Date(dateInput);
      if (isNaN(d.getTime())) return String(dateInput);

      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');

      switch (preferences.dateFormat) {
        case 'YYYY-MM-DD':
          return `${year}-${month}-${day}`;
        case 'MM/DD/YYYY':
          return `${month}/${day}/${year}`;
        case 'DD/MM/YYYY':
        default:
          return `${day}/${month}/${year}`;
      }
    } catch {
      return String(dateInput);
    }
  };

  // Date & Time formatter according to user's date & time format
  const formatDateTime = (dateInput) => {
    if (!dateInput) return '—';
    try {
      const d = new Date(dateInput);
      if (isNaN(d.getTime())) return String(dateInput);

      const datePart = formatDate(dateInput);

      let timePart = '';
      if (preferences.timeFormat === '24h') {
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        timePart = `${hours}:${mins}`;
      } else {
        timePart = d.toLocaleTimeString(preferences.language === 'ar' ? 'ar-QA' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
      }

      return `${datePart} ${timePart}`;
    } catch {
      return String(dateInput);
    }
  };

  const value = {
    language: preferences.language,
    direction: preferences.language === 'ar' ? 'rtl' : 'ltr',
    timezone: preferences.timezone,
    dateFormat: preferences.dateFormat,
    timeFormat: preferences.timeFormat,
    accentColor: preferences.accentColor,
    t,
    formatDate,
    formatDateTime,
    updatePreferences,
  };

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
}
