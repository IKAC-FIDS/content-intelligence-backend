import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { ApiErrorResponse } from '../http/api-response.types';
import {
  RequestWithRequestId,
  buildHttpLogContext,
  getRequestId,
} from '../logging/http-log-context';

type NestErrorResponse =
  | string
  | {
      statusCode?: number;
      message?: string | string[];
      error?: string;
      code?: string;
      details?: unknown;
    };

function normalizeMessage(message: unknown): string {
  if (Array.isArray(message)) {
    return message.join('; ');
  }

  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  return 'Unexpected error';
}

function normalizeDetails(message: unknown, explicitDetails?: unknown): unknown {
  if (explicitDetails !== undefined) {
    return explicitDetails;
  }

  if (Array.isArray(message)) {
    return message;
  }

  return undefined;
}

function httpStatusToCode(statusCode: number): string {
  switch (statusCode) {
    case HttpStatus.BAD_REQUEST:
      return 'BAD_REQUEST';

    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';

    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';

    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';

    case HttpStatus.CONFLICT:
      return 'CONFLICT';

    case HttpStatus.GONE:
      return 'GONE';

    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';

    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'UNPROCESSABLE_ENTITY';

    case HttpStatus.SERVICE_UNAVAILABLE:
      return 'SERVICE_UNAVAILABLE';

    default:
      return statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'HTTP_ERROR';
  }
}

function isMulterError(
  exception: unknown,
): exception is { name: string; code: string; message: string } {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'name' in exception &&
    'code' in exception &&
    (exception as { name?: unknown }).name === 'MulterError'
  );
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<RequestWithRequestId>();
    const response = ctx.getResponse<Response>();

    const normalized = this.normalizeException(exception);
    const requestId = getRequestId(request, response);

    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details !== undefined && {
          details: normalized.details,
        }),
      },
      requestId,
      timestamp: new Date().toISOString(),
      path: request.originalUrl || request.url,
      method: request.method,
      statusCode: normalized.statusCode,
    };

    this.logException(exception, request, response, normalized, requestId);

    response.status(normalized.statusCode).json(body);
  }

  private logException(
    exception: unknown,
    request: RequestWithRequestId,
    response: Response,
    normalized: {
      statusCode: number;
      code: string;
      message: string;
      details?: unknown;
    },
    requestId: string | null,
  ) {
    const error =
      exception instanceof Error
        ? {
            name: exception.name,
            message: exception.message,
            stack: exception.stack,
          }
        : {
            name: 'NonErrorException',
            message: String(exception),
            stack: null,
          };

    const context = {
      ...buildHttpLogContext(request, response),
      requestId,
      statusCode: normalized.statusCode,
      errorCode: normalized.code,
      errorMessage: normalized.message,
      exception: error,
    };

    const message = `${request.method} ${request.originalUrl || request.url} failed ${normalized.statusCode} requestId=${requestId ?? 'none'}`;

    if (normalized.statusCode >= 500) {
      this.logger.error(message, error.stack, JSON.stringify(context));
      return;
    }

    this.logger.warn(message, JSON.stringify(context));
  }

  private normalizeException(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (isMulterError(exception)) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: `UPLOAD_${exception.code}`,
        message: exception.message || 'File upload error',
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse() as NestErrorResponse;

      if (typeof exceptionResponse === 'string') {
        return {
          statusCode,
          code: httpStatusToCode(statusCode),
          message: exceptionResponse,
        };
      }

      const message = exceptionResponse.message ?? exception.message;

      const isValidationError =
        statusCode === HttpStatus.BAD_REQUEST &&
        Array.isArray(exceptionResponse.message);

      return {
        statusCode,
        code:
          exceptionResponse.code ??
          (isValidationError
            ? 'VALIDATION_ERROR'
            : httpStatusToCode(statusCode)),
        message: isValidationError
          ? 'Validation failed'
          : normalizeMessage(message),
        details: normalizeDetails(message, exceptionResponse.details),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.normalizePrismaKnownError(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'PRISMA_VALIDATION_ERROR',
        message: 'Database validation error',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    };
  }

  private normalizePrismaKnownError(
    exception: Prisma.PrismaClientKnownRequestError,
  ): {
    statusCode: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    switch (exception.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'UNIQUE_CONSTRAINT_FAILED',
          message: 'Unique constraint failed',
          details: exception.meta,
        };

      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          code: 'FOREIGN_KEY_CONSTRAINT_FAILED',
          message: 'Invalid relation reference',
          details: exception.meta,
        };

      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          code: 'RECORD_NOT_FOUND',
          message: 'Record not found',
          details: exception.meta,
        };

      default:
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          code: `PRISMA_${exception.code}`,
          message: 'Database request error',
          details: exception.meta,
        };
    }
  }
}
