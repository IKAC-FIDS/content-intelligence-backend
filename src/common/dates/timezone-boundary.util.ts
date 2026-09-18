export function zonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

export function zonedMidnightUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string,
) {
  const target = Date.UTC(year, month - 1, day);
  let result = new Date(target);
  for (let i = 0; i < 3; i += 1) {
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(result);
    const get = (type: string) =>
      Number(formatted.find((part) => part.type === type)?.value);
    const represented = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    );
    result = new Date(result.getTime() + target - represented);
  }
  return result;
}

export function organizationDayBounds(now: Date, timeZone: string) {
  const { year, month, day } = zonedDateParts(now, timeZone);
  const start = zonedMidnightUtc(year, month, day, timeZone);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1));
  const end = zonedMidnightUtc(
    nextDate.getUTCFullYear(),
    nextDate.getUTCMonth() + 1,
    nextDate.getUTCDate(),
    timeZone,
  );
  return { start, end };
}

export function addOrganizationCalendarDays(
  date: Date,
  days: number,
  timeZone: string,
) {
  const { year, month, day } = zonedDateParts(date, timeZone);
  const target = new Date(Date.UTC(year, month - 1, day + days));
  return zonedMidnightUtc(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    target.getUTCDate(),
    timeZone,
  );
}
