export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: unknown;
  requestId?: string | null;
  timestamp: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorBody;
  requestId?: string | null;
  timestamp: string;
  path: string;
  method: string;
  statusCode: number;
}

export interface PaginatedPayload<T = unknown> {
  data: T;
  meta: unknown;
}