import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';

type DependencyStatus = 'up' | 'down';

interface PackageInfo {
  name?: string;
  version?: string;
  description?: string;
}

@Injectable()
export class HealthService {
  private readonly startedAt = new Date();
  private readonly packageInfo: PackageInfo;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.packageInfo = this.readPackageInfo();
  }

  getHealth() {
    return {
      status: 'ok',
      service: this.getServiceName(),
      environment: this.config.get<string>('NODE_ENV', 'development'),
      uptimeSeconds: Math.floor(process.uptime()),
      startedAt: this.startedAt.toISOString(),
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness() {
    const database = await this.checkDatabase();

    const isReady = database.status === 'up';

    const payload = {
      status: isReady ? 'ready' : 'not_ready',
      service: this.getServiceName(),
      environment: this.config.get<string>('NODE_ENV', 'development'),
      uptimeSeconds: Math.floor(process.uptime()),
      checks: {
        api: {
          status: 'up' as DependencyStatus,
        },
        database,
      },
      timestamp: new Date().toISOString(),
    };

    if (!isReady) {
      throw new ServiceUnavailableException({
        code: 'READINESS_CHECK_FAILED',
        message: 'Service is not ready',
        details: payload,
      });
    }

    return payload;
  }

  getVersion() {
    return {
      service: this.getServiceName(),
      version: this.getVersionValue(),
      packageName: this.packageInfo.name ?? 'iam-crm-backend',
      environment: this.config.get<string>('NODE_ENV', 'development'),
      commit: this.config.get<string>('APP_COMMIT_SHA') ?? null,
      buildTime: this.config.get<string>('APP_BUILD_TIME') ?? null,
      nodeVersion: process.version,
    };
  }

  private async checkDatabase(): Promise<{
    status: DependencyStatus;
    latencyMs?: number;
    error?: string;
  }> {
    const started = Date.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'up',
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - started,
        error: this.normalizeError(error),
      };
    }
  }

  private getServiceName() {
    return this.packageInfo.name ?? 'iam-crm-backend';
  }

  private getVersionValue() {
    return (
      this.config.get<string>('APP_VERSION') ??
      this.packageInfo.version ??
      '0.0.0'
    );
  }

  private readPackageInfo(): PackageInfo {
    try {
      return JSON.parse(
        readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
      ) as PackageInfo;
    } catch {
      return {};
    }
  }

  private normalizeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown readiness error';
  }
}