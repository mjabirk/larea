import { useEffect } from 'react';

/**
 * Custom hook to detect clicks outside a referenced DOM element.
 * Supports mousedown and touchstart listeners for desktop and mobile.
 *
 * @param {React.RefObject} ref - The React ref to the target DOM element
 * @param {Function} handler - The callback function to invoke when a click outside occurs
 * @param {boolean} active - Whether the listener should be active
 */
export function useClickOutside(ref, handler, active = true) {
  useEffect(() => {
    if (!active) return;

    const listener = (event) => {
      // Do nothing if clicking ref's element or descendent elements
      if (!ref.current || ref.current.contains(event.target)) {
        return;
      }
      handler(event);
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);

    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler, active]);
}
