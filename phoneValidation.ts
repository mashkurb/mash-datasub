/**
 * Phone Number Utilities for Mash DataSub
 * Enforces Nigerian phone number constraints:
 * - Maximum 11 digits
 * - Valid Nigerian prefix (070, 071, 080, 081, 090, 091, 082, 092, etc.)
 * - Prevents entering more than 11 digits
 */

export function sanitizeNigerianPhoneInput(input: string): string {
  if (!input) return '';
  let cleaned = input.trim();

  // Convert international prefix +234 or 234 to standard 0 format
  if (cleaned.startsWith('+234')) {
    cleaned = '0' + cleaned.slice(4);
  } else if (cleaned.startsWith('234') && cleaned.length > 10) {
    cleaned = '0' + cleaned.slice(3);
  }

  // Strip all non-numeric characters and cap strictly at 11 digits
  return cleaned.replace(/\D/g, '').slice(0, 11);
}

export function validateNigerianPhone(phone: string): { valid: boolean; isValid: boolean; error?: string; errorMessage?: string } {
  const digits = phone.replace(/\D/g, '');

  if (!digits) {
    const msg = 'Phone number is required.';
    return { valid: false, isValid: false, error: msg, errorMessage: msg };
  }

  if (digits.length < 11) {
    const msg = `Phone number is incomplete (${digits.length}/11 digits). Please enter a full 11-digit Nigerian number.`;
    return {
      valid: false,
      isValid: false,
      error: msg,
      errorMessage: msg
    };
  }

  if (digits.length > 11) {
    const msg = 'Phone number cannot exceed 11 digits.';
    return {
      valid: false,
      isValid: false,
      error: msg,
      errorMessage: msg
    };
  }

  // Nigerian numbers start with 0 followed by 7, 8, or 9
  if (!/^0[789]\d{9}$/.test(digits)) {
    const msg = 'Invalid Nigerian phone format. Must start with a valid prefix (e.g. 080, 081, 070, 090, 091).';
    return {
      valid: false,
      isValid: false,
      error: msg,
      errorMessage: msg
    };
  }

  return { valid: true, isValid: true };
}
