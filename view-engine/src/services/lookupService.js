import { useState, useEffect, useCallback, useMemo } from 'react';

/**
 * Standard ISO-3166 Fallback Countries
 */
export const DEFAULT_COUNTRIES = [
  { code: 'QA', name: 'Qatar', phone_code: '+974' },
  { code: 'SA', name: 'Saudi Arabia', phone_code: '+966' },
  { code: 'AE', name: 'United Arab Emirates', phone_code: '+971' },
  { code: 'KW', name: 'Kuwait', phone_code: '+965' },
  { code: 'OM', name: 'Oman', phone_code: '+968' },
  { code: 'BH', name: 'Bahrain', phone_code: '+973' },
  { code: 'GB', name: 'United Kingdom', phone_code: '+44' },
  { code: 'US', name: 'United States', phone_code: '+1' },
  { code: 'IN', name: 'India', phone_code: '+91' },
  { code: 'PH', name: 'Philippines', phone_code: '+63' },
  { code: 'EG', name: 'Egypt', phone_code: '+20' },
  { code: 'BD', name: 'Bangladesh', phone_code: '+880' },
  { code: 'PK', name: 'Pakistan', phone_code: '+92' },
  { code: 'NP', name: 'Nepal', phone_code: '+977' },
  { code: 'LK', name: 'Sri Lanka', phone_code: '+94' },
  { code: 'JO', name: 'Jordan', phone_code: '+962' },
  { code: 'LB', name: 'Lebanon', phone_code: '+961' },
  { code: 'SY', name: 'Syria', phone_code: '+963' },
  { code: 'IQ', name: 'Iraq', phone_code: '+964' },
  { code: 'YE', name: 'Yemen', phone_code: '+967' },
  { code: 'SD', name: 'Sudan', phone_code: '+249' },
  { code: 'TN', name: 'Tunisia', phone_code: '+216' },
  { code: 'MA', name: 'Morocco', phone_code: '+212' },
  { code: 'DZ', name: 'Algeria', phone_code: '+213' },
  { code: 'TR', name: 'Turkey', phone_code: '+90' },
  { code: 'DE', name: 'Germany', phone_code: '+49' },
  { code: 'FR', name: 'France', phone_code: '+33' },
  { code: 'IT', name: 'Italy', phone_code: '+39' },
  { code: 'ES', name: 'Spain', phone_code: '+34' },
  { code: 'CA', name: 'Canada', phone_code: '+1' },
  { code: 'AU', name: 'Australia', phone_code: '+61' },
  { code: 'SG', name: 'Singapore', phone_code: '+65' },
  { code: 'MY', name: 'Malaysia', phone_code: '+60' },
  { code: 'ID', name: 'Indonesia', phone_code: '+62' },
  { code: 'CN', name: 'China', phone_code: '+86' },
  { code: 'JP', name: 'Japan', phone_code: '+81' },
  { code: 'KR', name: 'South Korea', phone_code: '+82' },
  { code: 'ZA', name: 'South Africa', phone_code: '+27' },
  { code: 'KE', name: 'Kenya', phone_code: '+254' },
  { code: 'NG', name: 'Nigeria', phone_code: '+234' },
  { code: 'GH', name: 'Ghana', phone_code: '+233' },
  { code: 'CH', name: 'Switzerland', phone_code: '+41' },
  { code: 'NL', name: 'Netherlands', phone_code: '+31' },
  { code: 'SE', name: 'Sweden', phone_code: '+46' },
  { code: 'NO', name: 'Norway', phone_code: '+47' },
  { code: 'BR', name: 'Brazil', phone_code: '+55' },
  { code: 'MX', name: 'Mexico', phone_code: '+52' },
];

/**
 * Standard ISO-4217 Fallback Currencies
 */
export const DEFAULT_CURRENCIES = [
  { code: 'QAR', name: 'Qatari Riyal', symbol: 'QR' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED' },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'KD' },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: 'BD' },
  { code: 'OMR', name: 'Omani Rial', symbol: 'OMR' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
];

const STORAGE_KEY_COUNTRIES = 'larea_system_countries';
const STORAGE_KEY_CURRENCIES = 'larea_system_currencies';

// In-memory module cache
let cachedCountries = null;
let cachedCurrencies = null;
let fetchPromise = null;

function loadFromStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn(`Failed to read ${key} from storage:`, e);
  }
  return fallback;
}

function saveToStorage(key, data) {
  if (typeof window === 'undefined' || !data) return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn(`Failed to save ${key} to storage:`, e);
  }
}

/**
 * Fetch system countries from backend with fallback
 */
export async function fetchSystemCountries() {
  try {
    const res = await fetch('/api/v1/system/countries');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.countries) && data.countries.length > 0) {
        cachedCountries = data.countries;
        saveToStorage(STORAGE_KEY_COUNTRIES, data.countries);
        return data.countries;
      }
    }
  } catch (e) {
    console.warn('Unable to fetch /api/v1/system/countries, using cached/default:', e);
  }
  if (!cachedCountries) {
    cachedCountries = loadFromStorage(STORAGE_KEY_COUNTRIES, DEFAULT_COUNTRIES);
  }
  return cachedCountries;
}

/**
 * Fetch system currencies from backend with fallback
 */
export async function fetchSystemCurrencies() {
  try {
    const res = await fetch('/api/v1/system/currencies');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.currencies) && data.currencies.length > 0) {
        cachedCurrencies = data.currencies;
        saveToStorage(STORAGE_KEY_CURRENCIES, data.currencies);
        return data.currencies;
      }
    }
  } catch (e) {
    console.warn('Unable to fetch /api/v1/system/currencies, using cached/default:', e);
  }
  if (!cachedCurrencies) {
    cachedCurrencies = loadFromStorage(STORAGE_KEY_CURRENCIES, DEFAULT_CURRENCIES);
  }
  return cachedCurrencies;
}

/**
 * Helper to get country name by ISO code or existing name
 */
export function getCountryName(codeOrName, countriesList = cachedCountries || DEFAULT_COUNTRIES) {
  if (!codeOrName) return '';
  const search = String(codeOrName).trim().toUpperCase();
  const found = countriesList.find(
    (c) => c.code.toUpperCase() === search || c.name.toUpperCase() === search
  );
  return found ? found.name : codeOrName;
}

/**
 * Helper to get ISO country code by name or code
 */
export function getCountryCode(codeOrName, countriesList = cachedCountries || DEFAULT_COUNTRIES) {
  if (!codeOrName) return '';
  const search = String(codeOrName).trim().toUpperCase();
  const found = countriesList.find(
    (c) => c.code.toUpperCase() === search || c.name.toUpperCase() === search
  );
  return found ? found.code : codeOrName;
}

/**
 * Helper to get phone dial code by country code or name
 */
export function getPhoneCode(codeOrName, countriesList = cachedCountries || DEFAULT_COUNTRIES) {
  if (!codeOrName) return '+974';
  const search = String(codeOrName).trim().toUpperCase();
  const found = countriesList.find(
    (c) => c.code.toUpperCase() === search || c.name.toUpperCase() === search || c.phone_code === search
  );
  return found?.phone_code || '+974';
}

/**
 * Helper to get currency display label (e.g. "Qatari Riyal (QR)")
 */
export function getCurrencyName(code, currenciesList = cachedCurrencies || DEFAULT_CURRENCIES) {
  if (!code) return '';
  const search = String(code).trim().toUpperCase();
  const found = currenciesList.find((c) => c.code.toUpperCase() === search);
  return found ? `${found.name} (${found.symbol})` : code;
}

/**
 * Helper to get currency symbol (e.g. "QR" or "$")
 */
export function getCurrencySymbol(code, currenciesList = cachedCurrencies || DEFAULT_CURRENCIES) {
  if (!code) return '';
  const search = String(code).trim().toUpperCase();
  const found = currenciesList.find((c) => c.code.toUpperCase() === search);
  return found?.symbol || code;
}

/**
 * Centralized React Hook for Standard System Lookups (Countries & Currencies)
 */
export function useSystemLookups() {
  const [countries, setCountries] = useState(() => {
    if (cachedCountries) return cachedCountries;
    return loadFromStorage(STORAGE_KEY_COUNTRIES, DEFAULT_COUNTRIES);
  });

  const [currencies, setCurrencies] = useState(() => {
    if (cachedCurrencies) return cachedCurrencies;
    return loadFromStorage(STORAGE_KEY_CURRENCIES, DEFAULT_CURRENCIES);
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const reloadLookups = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!fetchPromise) {
        fetchPromise = Promise.all([fetchSystemCountries(), fetchSystemCurrencies()]).finally(() => {
          fetchPromise = null;
        });
      }
      const [fetchedCountries, fetchedCurrencies] = await fetchPromise;
      setCountries(fetchedCountries);
      setCurrencies(fetchedCurrencies);
    } catch (err) {
      console.warn('Lookup sync error:', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadLookups();
  }, [reloadLookups]);

  // Convenience helper bound to current countries list
  const resolveCountryName = useCallback(
    (val) => getCountryName(val, countries),
    [countries]
  );

  const resolveCountryCode = useCallback(
    (val) => getCountryCode(val, countries),
    [countries]
  );

  const resolvePhoneCode = useCallback(
    (val) => getPhoneCode(val, countries),
    [countries]
  );

  const resolveCurrencyName = useCallback(
    (val) => getCurrencyName(val, currencies),
    [currencies]
  );

  const resolveCurrencySymbol = useCallback(
    (val) => getCurrencySymbol(val, currencies),
    [currencies]
  );

  return {
    countries,
    currencies,
    isLoading,
    error,
    refresh: reloadLookups,
    getCountryName: resolveCountryName,
    getCountryCode: resolveCountryCode,
    getPhoneCode: resolvePhoneCode,
    getCurrencyName: resolveCurrencyName,
    getCurrencySymbol: resolveCurrencySymbol,
  };
}

export default useSystemLookups;
