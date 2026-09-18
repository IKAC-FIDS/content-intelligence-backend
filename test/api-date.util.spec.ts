import { parseApiDate, parseApiDateRange } from '../src/common/dates/api-date.util';

describe('api date utilities', () => {
  it('parses YYYY-MM-DD as UTC midnight', () => {
    expect(parseApiDate('2026-07-12').toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });

  it('uses an exclusive next-day upper bound for date-only range end', () => {
    expect(parseApiDateRange('2026-07-01', '2026-07-12')).toEqual({
      gte: new Date('2026-07-01T00:00:00.000Z'),
      lt: new Date('2026-07-13T00:00:00.000Z'),
    });
  });

  it('keeps exact ISO upper bounds for date-time range end', () => {
    expect(parseApiDateRange(undefined, '2026-07-12T10:30:00.000Z')).toEqual({
      lte: new Date('2026-07-12T10:30:00.000Z'),
    });
  });

  it('rejects invalid Gregorian dates', () => {
    expect(() => parseApiDate('2026-02-31')).toThrow('date must be a valid Gregorian date');
  });

  it('rejects empty date-only ranges', () => {
    expect(() => parseApiDateRange('2026-07-13', '2026-07-12')).toThrow(
      'startDate must be before or equal to endDate',
    );
  });
});
