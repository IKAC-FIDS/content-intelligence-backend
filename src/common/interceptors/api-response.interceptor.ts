import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from "@nestjs/common";
import type { Response } from "express";
import { map, Observable } from "rxjs";
import {
  ApiSuccessResponse,
  PaginatedPayload,
} from "../http/api-response.types";

type AlreadyStandardResponse = {
  success: boolean;
  [key: string]: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAlreadyStandardResponse(
  value: unknown,
): value is AlreadyStandardResponse {
  return isObject(value) && typeof value.success === "boolean";
}

function isPaginatedPayload(value: unknown): value is PaginatedPayload {
  if (!isObject(value)) {
    return false;
  }

  const keys = Object.keys(value);

  return keys.length === 2 && keys.includes("data") && keys.includes("meta");
}

function getResponseRequestId(response: Response): string | null {
  const header = response.getHeader("x-request-id");

  if (Array.isArray(header)) {
    return String(header[0] ?? "").trim() || null;
  }

  if (header !== undefined) {
    return String(header).trim() || null;
  }

  return null;
}

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor<
  unknown,
  unknown
> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((payload: unknown): unknown => {
        if (payload instanceof StreamableFile) {
          return payload;
        }

        if (isAlreadyStandardResponse(payload)) {
          return payload;
        }

        const base = {
          success: true as const,
          requestId: getResponseRequestId(response),
          timestamp: new Date().toISOString(),
        };

        if (isPaginatedPayload(payload)) {
          const result: ApiSuccessResponse = {
            ...base,
            data: payload.data,
            meta: payload.meta,
          };

          return result;
        }

        const result: ApiSuccessResponse = {
          ...base,
          data: payload ?? null,
        };

        return result;
      }),
    );
  }
}
