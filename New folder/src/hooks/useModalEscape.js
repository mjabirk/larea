import { useEffect } from 'react';

/**
 * Custom hook to trigger a close callback when the Escape key is pressed.
 * Automatically cleans up listener on unmount or when modal closes.
 *
 * @param {Function} onClose - Function to call on Escape
 * @param {boolean} isOpen - Whether the modal is currently open / active
 */
export function useModalEscape(onClose, isOpen = true) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, isOpen]);
}
