export const COMPANY_PHONE_PATTERN = /^\+?\d{5,20}$/;

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizeCompanyPhone(
  value: string | null | undefined,
): string | null | undefined {
  if (value == null) {
    return value;
  }

  const normalized = value
    .trim()
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[\s\-()]/g, '');

  return normalized || null;
}

export function transformCompanyPhone({ value }: { value: unknown }) {
  return typeof value === 'string' || value == null
    ? normalizeCompanyPhone(value)
    : value;
}

export function isPhoneLikeSearch(
  value: string | null | undefined,
): value is string {
  return Boolean(value && /^\+?\d+$/.test(value));
}
