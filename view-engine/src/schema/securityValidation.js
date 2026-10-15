/**
 * Enterprise Password Complexity and Security Policy Validation
 * Enforces minimum 10 characters, at least one uppercase letter,
 * one digit, and one special symbol.
 */
export function validatePasswordComplexity(password) {
  if (!password || password.length < 10) {
    return 'Password must be at least 10 characters long.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter (A-Z).';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one digit (0-9).';
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return 'Password must contain at least one special symbol (!@#$%^&*...).';
  }
  return null;
}
