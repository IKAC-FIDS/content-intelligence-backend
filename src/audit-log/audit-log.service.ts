import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditActorType,
  AuditResult,
  AuditScope,
  AuditSource,
  Prisma,
} from "@prisma/client";
import type { PlatformScopeContext } from "../common/tenant/tenant-context.types";
import { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { parseApiDateRange } from "../common/dates/api-date.util";
import { ReportExportService } from "../common/export/report-export.service";
import { getCurrentOrganizationId } from "../common/tenant/tenant-scope.util";
import { PrismaService } from "../prisma/prisma.service";
import { AuditRequestContextService } from "./audit-request-context.service";
import { FindAuditLogsDto } from "./dto/find-audit-logs.dto";

export interface RecordAuditInput {
  actorId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestMethod?: string | null;
  requestPath?: string | null;
  organizationId?: string | null;
  scope?: AuditScope;
  actorType?: AuditActorType;
  actorMembershipId?: string | null;
  source?: AuditSource;
  result?: AuditResult;
  durationMs?: number | null;
  errorCode?: string | null;
}
@Injectable()
export class AuditLogService {
  constructor(
    private prisma: PrismaService,
    private requestContext: AuditRequestContextService,
    private exporter: ReportExportService,
  ) {}
  record(input: RecordAuditInput, db: Pick<Prisma.TransactionClient, 'auditLog'> = this.prisma) {
    const context = this.requestContext.getContext();
    const organizationId =
      input.organizationId !== undefined
        ? input.organizationId
        : context?.organizationId ?? null;
    const scope = input.scope ?? (organizationId ? AuditScope.TENANT : AuditScope.SYSTEM);
    if (scope === AuditScope.TENANT && !organizationId)
      throw new BadRequestException("Tenant audit events require organizationId");
    if (scope === AuditScope.PLATFORM && input.actorMembershipId)
      throw new BadRequestException("Platform audit events cannot use Tenant membership");
    const durationMs = input.durationMs ?? null;
    if (durationMs !== null && (!Number.isSafeInteger(durationMs) || durationMs < 0))
      throw new BadRequestException("durationMs must be a non-negative integer");
    return db.auditLog.create({
      data: {
        actorId: input.actorId ?? context?.actorUserId ?? null,
        actorType:
          input.actorType ??
          (input.actorId ?? context?.actorUserId
            ? AuditActorType.USER
            : AuditActorType.SYSTEM),
        actorMembershipId:
          scope === AuditScope.TENANT
            ? input.actorMembershipId ?? context?.actorMembershipId ?? null
            : null,
        scope,
        source:
          input.source ??
          (context?.requestMethod ? AuditSource.API : AuditSource.SYSTEM),
        result: input.result ?? AuditResult.SUCCESS,
        durationMs,
        errorCode: this.boundString(input.errorCode, 120),
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        action: input.action,
        requestId: input.requestId ?? context?.requestId ?? null,
        ipAddress: input.ipAddress ?? context?.ipAddress ?? null,
        userAgent: this.boundString(input.userAgent ?? context?.userAgent, 512),
        requestMethod: input.requestMethod ?? context?.requestMethod ?? null,
        requestPath: input.requestPath ?? context?.requestPath ?? null,
        organizationId,
        ...(input.before !== undefined && {
          before: this.sanitizeForStorage(input.before),
        }),
        ...(input.after !== undefined && {
          after: this.sanitizeForStorage(input.after),
        }),
        ...(input.metadata !== undefined && {
          metadata: this.sanitizeForStorage(input.metadata),
        }),
      },
    });
  }

  recordTenantEvent(input: Omit<RecordAuditInput, "scope">) {
    return this.record({ ...input, scope: AuditScope.TENANT });
  }

  recordPlatformEvent(
    platform: PlatformScopeContext,
    input: Omit<RecordAuditInput, "scope" | "actorId" | "actorType" | "actorMembershipId">,
  ) {
    return this.record({
      ...input,
      scope: AuditScope.PLATFORM,
      actorId: platform.userId,
      actorType: AuditActorType.PLATFORM_ADMIN,
      actorMembershipId: null,
      source: input.source ?? AuditSource.PLATFORM,
      requestId: input.requestId ?? platform.requestId,
    });
  }
  async findAll(query: FindAuditLogsDto, user: CurrentUserPayload) {
    const page = query.page ?? 1,
      limit = query.limit ?? 20,
      where = this.where(query, user);
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: this.orderBy(query),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      data: await this.present(rows, Boolean(query.compact)),
      meta: this.meta(total, page, limit),
    };
  }
  async findOne(id: string, user: CurrentUserPayload) {
    const row = await this.prisma.auditLog.findFirst({
      where: { id, organizationId: getCurrentOrganizationId(user), scope: AuditScope.TENANT },
    });
    if (!row) throw new NotFoundException("Audit log not found");
    return (await this.present([row], false))[0];
  }

  async findAllPlatform(query: FindAuditLogsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.platformWhere(query);
    const orderBy = this.orderBy(query);
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data: await this.present(rows, Boolean(query.compact)), meta: this.meta(total, page, limit) };
  }

  async findOnePlatform(id: string) {
    const row = await this.prisma.auditLog.findFirst({ where: { id, scope: AuditScope.PLATFORM } });
    if (!row) throw new NotFoundException("Platform audit log not found");
    return (await this.present([row], false))[0];
  }
  async summary(query: FindAuditLogsDto, user: CurrentUserPayload) {
    const where = this.where(query, user);
    const rows = await this.prisma.auditLog.findMany({
      where,
      select: {
        actorId: true,
        action: true,
        entityType: true,
        createdAt: true,
      },
    });
    const actors = await this.actors(rows.map((r) => r.actorId));
    const count = (key: "action" | "entityType") =>
      [...this.group(rows, (r) => r[key])]
        .map(([value, items]) => ({ [key]: value, count: items.length }))
        .sort((a, b) => b.count - a.count);
    const byActor = [...this.group(rows, (r) => r.actorId ?? "SYSTEM")]
      .map(([id, items]) => ({
        actorId: id === "SYSTEM" ? null : id,
        actorName:
          id === "SYSTEM" ? "System" : (actors.get(id)?.fullName ?? "Unknown"),
        count: items.length,
      }))
      .sort((a, b) => b.count - a.count);
    return {
      period: this.period(query),
      totalEvents: rows.length,
      uniqueActors: new Set(rows.map((r) => r.actorId).filter(Boolean)).size,
      byAction: count("action"),
      byEntityType: count("entityType"),
      byActor,
      trend: this.trend(rows),
    };
  }
  async filterOptions(query: FindAuditLogsDto, user: CurrentUserPayload) {
    const rows = await this.prisma.auditLog.findMany({
      where: this.where(query, user),
      select: {
        actorId: true,
        entityType: true,
        action: true,
        requestMethod: true,
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
    const actorMap = await this.actors(rows.map((r) => r.actorId));
    return {
      actors: [...actorMap.values()],
      entityTypes: [...new Set(rows.map((r) => r.entityType))].sort(),
      actions: [...new Set(rows.map((r) => r.action))].sort(),
      requestMethods: [
        ...new Set(rows.map((r) => r.requestMethod).filter(Boolean)),
      ].sort(),
    };
  }
  async export(query: FindAuditLogsDto, user: CurrentUserPayload) {
    const format = query.format ?? "csv",
      max = query.includePayload ? 5000 : format === "csv" ? 50000 : 20000,
      where = this.where(query, user),
      total = await this.prisma.auditLog.count({ where });
    if (total > max)
      throw new BadRequestException({
        code: "EXPORT_ROW_LIMIT_EXCEEDED",
        message: `Export is limited to ${max} rows`,
        maxRows: max,
        totalRows: total,
      });
    const rows = await this.prisma.auditLog.findMany({
      where,
        orderBy: this.orderBy(query),
      take: max,
    });
    const data = await this.present(rows, !query.includePayload);
    const flat = data.map((r: any) => ({
      id: r.id,
      createdAt: r.createdAt,
      actor: r.actor?.fullName ?? "System",
      entityType: r.entityType,
      entityId: r.entityId,
      action: r.action,
      requestId: r.request?.requestId,
      method: r.request?.method,
      path: r.request?.path,
      ipAddress: r.request?.ipAddress,
      changedFields: r.changedFields.join(", "),
      ...(query.includePayload
        ? {
            before: this.cap(r.before),
            after: this.cap(r.after),
            metadata: this.cap(r.metadata),
          }
        : {}),
    }));
    const file = format === "json"
      ? this.jsonExport("audit-logs", data)
      : this.exporter.create(format, "audit-logs", [{ name: "Audit Logs", rows: flat }], max);
    await this.record({
      actorId: user.userId,
      organizationId: getCurrentOrganizationId(user),
      entityType: "audit-log",
      action: "audit-log.exported",
      metadata: {
        format,
        rowCount: file.rowCount,
        filters: this.filterSummary(query),
      },
    });
    return file;
  }
  async exportPlatform(query: FindAuditLogsDto, platform: PlatformScopeContext) {
    const format = query.format ?? "csv";
    const max = query.includePayload ? 5000 : 50000;
    const where = this.platformWhere(query);
    const total = await this.prisma.auditLog.count({ where });
    if (total > max) throw new BadRequestException({ code: "EXPORT_ROW_LIMIT_EXCEEDED", maxRows: max, totalRows: total });
    const rows = await this.prisma.auditLog.findMany({ where, orderBy: this.orderBy(query), take: max });
    const data = await this.present(rows, !query.includePayload);
    const flat = data.map((row: any) => ({
      id: row.id, createdAt: row.createdAt, scope: row.scope, organizationId: rows.find((item) => item.id === row.id)?.organizationId,
      actorId: row.actorId, actorMembershipId: row.actorMembershipId, entityType: row.entityType, entityId: row.entityId,
      action: row.action, source: row.source, result: row.result, durationMs: row.durationMs, requestId: row.request?.requestId,
    }));
    const file = format === "json"
      ? this.jsonExport("platform-audit-logs", data)
      : this.exporter.create(format, "platform-audit-logs", [{ name: "Platform Audit Logs", rows: flat }], max);
    await this.recordPlatformEvent(platform, { entityType: "audit-log", action: "audit-log.exported", metadata: { format, rowCount: file.rowCount, filters: this.filterSummary(query) } });
    return file;
  }
  private where(
    q: FindAuditLogsDto,
    user: CurrentUserPayload,
  ): Prisma.AuditLogWhereInput {
    const range = parseApiDateRange(
      q.startDate,
      q.endDate,
      "startDate",
      "endDate",
    );
    const actorIds = q.actorIds ?? (q.actorId ? [q.actorId] : undefined),
      entityTypes =
        q.entityTypes ?? (q.entityType ? [q.entityType] : undefined),
      actions = q.actions ?? (q.action ? [q.action] : undefined),
      methods =
        q.requestMethods?.map((x) => x.toUpperCase()) ??
        (q.requestMethod ? [q.requestMethod.toUpperCase()] : undefined);
    return {
      organizationId: getCurrentOrganizationId(user),
      scope: AuditScope.TENANT,
      ...(q.actorMembershipId && { actorMembershipId: q.actorMembershipId }),
      ...(q.source && { source: q.source }),
      ...(q.result && { result: q.result }),
      ...(actorIds && { actorId: { in: actorIds } }),
      ...(entityTypes && { entityType: { in: entityTypes } }),
      ...(q.entityId && { entityId: q.entityId }),
      ...(actions && { action: { in: actions } }),
      ...(q.requestId && { requestId: q.requestId }),
      ...(q.ipAddress && {
        ipAddress: { contains: q.ipAddress, mode: "insensitive" },
      }),
      ...(methods && { requestMethod: { in: methods } }),
      ...(q.requestPath && {
        requestPath: { contains: q.requestPath, mode: "insensitive" },
      }),
      ...(range && { createdAt: range }),
      ...(q.search && {
        OR: [
          { action: { contains: q.search, mode: "insensitive" } },
          { entityType: { contains: q.search, mode: "insensitive" } },
          { entityId: { contains: q.search, mode: "insensitive" } },
          { requestPath: { contains: q.search, mode: "insensitive" } },
          { requestId: { contains: q.search, mode: "insensitive" } },
        ],
      }),
    };
  }
  private platformWhere(q: FindAuditLogsDto): Prisma.AuditLogWhereInput {
    return { ...this.baseWhere(q), scope: AuditScope.PLATFORM, ...(q.organizationId && { organizationId: q.organizationId }) };
  }
  private baseWhere(q: FindAuditLogsDto): Prisma.AuditLogWhereInput {
    const range = parseApiDateRange(q.startDate, q.endDate, "startDate", "endDate");
    return {
      ...(q.actorId && { actorId: q.actorId }),
      ...(q.actorMembershipId && { actorMembershipId: q.actorMembershipId }),
      ...(q.requestId && { requestId: q.requestId }),
      ...(q.entityType && { entityType: q.entityType }),
      ...(q.entityId && { entityId: q.entityId }),
      ...(q.action && { action: q.actionPrefix ? { startsWith: q.action, mode: "insensitive" } : q.action }),
      ...(q.source && { source: q.source }),
      ...(q.result && { result: q.result }),
      ...(q.ipAddress && { ipAddress: { contains: q.ipAddress, mode: "insensitive" } }),
      ...(range && { createdAt: range }),
    };
  }
  private orderBy(q: FindAuditLogsDto): Prisma.AuditLogOrderByWithRelationInput[] {
    const field = q.sortBy ?? "createdAt";
    const direction = q.sortOrder ?? "desc";
    return [{ [field]: direction }, { id: "desc" }];
  }
  private async present(rows: any[], compact: boolean) {
    const actorMap = await this.actors(rows.map((r) => r.actorId));
    return rows.map((row) => {
      const before = this.sanitize(row.before),
        after = this.sanitize(row.after),
        metadata = this.sanitize(row.metadata),
        base = {
          id: row.id,
          organizationId: row.organizationId,
          actorId: row.actorId,
          actor: row.actorId ? (actorMap.get(row.actorId) ?? null) : null,
          entityType: row.entityType,
          entityId: row.entityId,
          action: row.action,
          scope: row.scope,
          actorType: row.actorType,
          actorMembershipId: row.actorMembershipId,
          source: row.source,
          result: row.result,
          durationMs: row.durationMs,
          errorCode: row.errorCode,
          createdAt: row.createdAt,
          changedFields: this.changed(before, after),
          request: {
            requestId: row.requestId,
            ipAddress: row.ipAddress,
            userAgent: row.userAgent,
            method: row.requestMethod,
            path: row.requestPath,
          },
        };
      return compact ? base : { ...base, before, after, metadata };
    });
  }
  private async actors(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    const rows = unique.length
      ? await this.prisma.user.findMany({
          where: { id: { in: unique } },
          select: { id: true, fullName: true, email: true },
        })
      : [];
    return new Map(rows.map((r) => [r.id, r]));
  }
  sanitize(value: unknown, depth = 0): unknown {
    if (depth > 6) return "[TRUNCATED_DEPTH]";
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "bigint") return value.toString();
    if (Array.isArray(value)) return value.slice(0, 100).map((v) => this.sanitize(v, depth + 1));
    if (value && typeof value === "object") {
      const json = value as { toJSON?: () => unknown };
      if (typeof json.toJSON === "function")
        return this.sanitize(json.toJSON(), depth + 1);
      return Object.fromEntries(
        Object.entries(value)
          .slice(0, 100)
          .filter(
            ([key]) =>
              !/(password|hash|token|secret|authorization|cookie|credential|session|private.?key)/i.test(
                key,
              ),
          )
          .map(([key, item]) => [key, this.sanitize(item, depth + 1)]),
      );
    }
    if (typeof value === "string") return value.length > 4000 ? `${value.slice(0, 4000)}...[TRUNCATED]` : value;
    return value;
  }
  private changed(before: unknown, after: unknown) {
    const out: string[] = [];
    const walk = (a: any, b: any, path: string, depth: number) => {
      if (out.length >= 100 || depth > 4) return;
      if (Array.isArray(a) || Array.isArray(b)) {
        if (JSON.stringify(a) !== JSON.stringify(b)) out.push(path || "$");
        return;
      }
      if (a && b && typeof a === "object" && typeof b === "object") {
        for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
          walk(a[key], b[key], path ? `${path}.${key}` : key, depth + 1);
        return;
      }
      if (JSON.stringify(a) !== JSON.stringify(b)) out.push(path || "$");
    };
    walk(before, after, "", 0);
    return out;
  }
  private trend(rows: { createdAt: Date }[]) {
    if (!rows.length) return [];
    const min = Math.min(...rows.map((r) => r.createdAt.getTime())),
      max = Math.max(...rows.map((r) => r.createdAt.getTime())) + 1,
      step = max - min <= 31 * 86400000 ? 86400000 : 7 * 86400000,
      out: Array<{ periodStart: string; periodEnd: string; count: number }> =
        [];
    for (let t = min; t < max; t += step) {
      const end = Math.min(max, t + step);
      out.push({
        periodStart: new Date(t).toISOString(),
        periodEnd: new Date(end).toISOString(),
        count: rows.filter(
          (r) => r.createdAt.getTime() >= t && r.createdAt.getTime() < end,
        ).length,
      });
    }
    return out;
  }
  private group<T>(rows: T[], key: (row: T) => string) {
    const m = new Map<string, T[]>();
    for (const row of rows) {
      const k = key(row);
      m.set(k, [...(m.get(k) ?? []), row]);
    }
    return m;
  }
  private meta(total: number, page: number, limit: number) {
    const totalPages = Math.ceil(total / limit);
    return {
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    };
  }
  private period(q: FindAuditLogsDto) {
    const r = parseApiDateRange(q.startDate, q.endDate);
    return {
      startDate: r?.gte?.toISOString() ?? null,
      endDate: (r?.lt ?? r?.lte)?.toISOString() ?? null,
    };
  }
  private cap(value: unknown) {
    const text = JSON.stringify(this.sanitize(value));
    return text.length > 10000 ? `${text.slice(0, 10000)}...[TRUNCATED]` : text;
  }
  private filterSummary(q: FindAuditLogsDto) {
    return {
      startDate: q.startDate,
      endDate: q.endDate,
      actorIds: q.actorIds,
      entityTypes: q.entityTypes,
      actions: q.actions,
      requestMethods: q.requestMethods,
      requestId: q.requestId,
      entityId: q.entityId,
    };
  }
  private boundString(value: string | null | undefined, max: number) {
    if (!value) return null;
    return value.trim().slice(0, max) || null;
  }
  private sanitizeForStorage(value: unknown): Prisma.InputJsonValue {
    const sanitized = this.sanitize(value) as Prisma.InputJsonValue;
    const serialized = JSON.stringify(sanitized);
    if (serialized.length <= 32768) return sanitized;
    return {
      truncated: true,
      originalSizeBytes: Buffer.byteLength(serialized, "utf8"),
      preview: serialized.slice(0, 30000),
    };
  }
  private jsonExport(filename: string, rows: unknown[]) {
    return {
      buffer: Buffer.from(JSON.stringify(rows), "utf8"),
      rowCount: rows.length,
      contentType: "application/json; charset=utf-8",
      contentDisposition: `attachment; filename="${filename}.json"`,
    };
  }
}
