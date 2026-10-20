import { useEffect, useRef } from 'react';

/**
 * Custom hook to manage modal accessibility:
 * - Traps keyboard focus within the modal container while open
 * - Automatically closes the modal when the Escape key is pressed
 * - Restores focus to the element that was focused before the modal opened
 *
 * @param {Function} onClose - Callback invoked when Escape key is pressed
 * @param {boolean} isOpen - Whether modal is active / mounted
 * @param {React.RefObject} containerRef - (Optional) Ref to modal element for focus trapping
 */
export function useModalEscape(onClose, isOpen = true, containerRef = null) {
  const previousActiveElement = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    // Save currently focused element to restore on close
    previousActiveElement.current = document.activeElement;

    // Automatically set focus into the modal container on open
    const focusTimer = setTimeout(() => {
      if (containerRef?.current) {
        const focusableSelector =
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        const focusables = Array.from(
          containerRef.current.querySelectorAll(focusableSelector)
        ).filter(
          (el) =>
            el.offsetParent !== null &&
            !el.hasAttribute('disabled') &&
            el.getAttribute('aria-hidden') !== 'true'
        );

        const autoFocusEl = containerRef.current.querySelector('[autofocus]');
        if (autoFocusEl && focusables.includes(autoFocusEl)) {
          autoFocusEl.focus();
        } else if (focusables.length > 0) {
          focusables[0].focus();
        } else if (containerRef.current.tabIndex >= 0 || containerRef.current.hasAttribute('tabindex')) {
          containerRef.current.focus();
        }
      }
    }, 50);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }

      if (event.key === 'Tab' && containerRef?.current) {
        const focusableSelector =
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        const focusables = Array.from(
          containerRef.current.querySelectorAll(focusableSelector)
        ).filter(
          (el) =>
            el.offsetParent !== null &&
            !el.hasAttribute('disabled') &&
            el.getAttribute('aria-hidden') !== 'true'
        );

        if (focusables.length === 0) {
          event.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (event.shiftKey) {
          if (document.activeElement === first || !containerRef.current.contains(document.activeElement)) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !containerRef.current.contains(document.activeElement)) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);

      // Restore previous focus when modal closes/unmounts
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        requestAnimationFrame(() => {
          try {
            previousActiveElement.current?.focus?.();
          } catch {
            // Ignore if element is no longer in DOM
          }
        });
      }
    };
  }, [onClose, isOpen, containerRef]);
}

