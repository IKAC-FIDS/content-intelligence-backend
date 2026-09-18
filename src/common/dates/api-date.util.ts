import { BadRequestException } from '@nestjs/common';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface ApiDateRange {
  gte?: Date;
  lte?: Date;
  lt?: Date;
}

export function isDateOnlyString(value: string): boolean {
  return DATE_ONLY_PATTERN.test(value);
}

export function parseApiDate(value: string, fieldName = 'date'): Date {
  const dateOnly = DATE_ONLY_PATTERN.exec(value);

  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException(`${fieldName} must be a valid Gregorian date`);
    }

    return date;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${fieldName} must be a valid ISO 8601 date`);
  }

  return date;
}

export function parseNullableApiDate(
  value: string | null | undefined,
  fieldName = 'date',
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  return parseApiDate(value, fieldName);
}

export function parseApiDateRange(
  from?: string,
  to?: string,
  fromFieldName = 'startDate',
  toFieldName = 'endDate',
): ApiDateRange | undefined {
  const startDate = from ? parseApiDate(from, fromFieldName) : undefined;
  const endDate = to ? parseApiDate(to, toFieldName) : undefined;

  if (!startDate && !endDate) return undefined;

  const range: ApiDateRange = {};

  if (startDate) {
    range.gte = startDate;
  }

  if (to) {
    if (isDateOnlyString(to)) {
      range.lt = addUtcDays(endDate!, 1);
    } else {
      range.lte = endDate;
    }
  }

  if (startDate && range.lt && startDate >= range.lt) {
    throw new BadRequestException(`${fromFieldName} must be before or equal to ${toFieldName}`);
  }

  if (startDate && range.lte && startDate > range.lte) {
    throw new BadRequestException(`${fromFieldName} must be before or equal to ${toFieldName}`);
  }

  return range;
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
