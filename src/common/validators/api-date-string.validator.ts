import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  isISO8601,
} from 'class-validator';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function IsApiDateString(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isApiDateString',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && isValidApiDateString(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid Gregorian YYYY-MM-DD date or ISO 8601 date-time string`;
        },
      },
    });
  };
}

export function isValidApiDateString(value: string): boolean {
  const dateOnly = DATE_ONLY_PATTERN.exec(value);

  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  return isISO8601(value, { strict: true });
}
