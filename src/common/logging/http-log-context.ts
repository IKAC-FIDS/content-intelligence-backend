import type { Request, Response } from 'express';
import { redactSensitiveData } from './redact-sensitive-data';

export type RequestWithRequestId = Request & {
  requestId?: string;
  route?: { path?: string };
};

export function getRequestId(req: RequestWithRequestId, res?: Response) {
  if (req.requestId) {
    return req.requestId;
  }

  const responseHeader = res?.getHeader('x-request-id');

  if (Array.isArray(responseHeader)) {
    return String(responseHeader[0] ?? '').trim() || null;
  }

  if (responseHeader !== undefined) {
    return String(responseHeader).trim() || null;
  }

  return resolveHeaderValue(req.headers['x-request-id']);
}

export function buildHttpLogContext(
  req: RequestWithRequestId,
  res?: Response,
) {
  return {
    requestId: getRequestId(req, res),
    method: req.method,
    originalUrl: req.originalUrl,
    url: req.url,
    routePath: req.route?.path ?? null,
    statusCode: res?.statusCode ?? null,
    ip: req.ip ?? req.socket?.remoteAddress ?? null,
    xForwardedFor: resolveHeaderValue(req.headers['x-forwarded-for']),
    xRealIp: resolveHeaderValue(req.headers['x-real-ip']),
    origin: resolveHeaderValue(req.headers.origin),
    referer: resolveHeaderValue(req.headers.referer),
    userAgent: resolveHeaderValue(req.headers['user-agent']),
    contentType: resolveHeaderValue(req.headers['content-type']),
    contentLength: resolveHeaderValue(req.headers['content-length']),
    host: resolveHeaderValue(req.headers.host),
    body: req.method === 'GET' ? undefined : redactSensitiveData(req.body),
    query: redactSensitiveData(req.query),
    params: redactSensitiveData(req.params),
  };
}

export function resolveHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }

  return value?.trim() || null;
}
