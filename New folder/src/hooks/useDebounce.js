import { useState, useEffect } from 'react';

/**
 * useDebounce hook
 * Delays updating the debounced value until after the specified delay has passed
 * since the last time the input value changed.
 *
 * @param {any} value - The input value to debounce
 * @param {number} delay - Delay in milliseconds (default: 300ms)
 * @returns {any} - The debounced value
 */
export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default useDebounce;
