import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from '../../src/health/health.service';

type MockConfigService = {
  get: jest.Mock;
};

type MockPrismaService = {
  $queryRaw: jest.Mock;
};

function createConfigService(
  values: Record<string, unknown> = {},
): MockConfigService {
  return {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        return values[key];
      }

      return defaultValue;
    }),
  };
}

function createPrismaService(): MockPrismaService {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ ok: 1 }]),
  };
}

describe('HealthService', () => {
  it('returns liveness status', () => {
    const config = createConfigService({
      NODE_ENV: 'test',
      APP_VERSION: '0.1.0',
    });
    const prisma = createPrismaService();

    const service = new HealthService(config as any, prisma as any);

    const result = service.getHealth();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('iam-crm-backend');
    expect(result.environment).toBe('test');
    expect(typeof result.uptimeSeconds).toBe('number');
    expect(result.startedAt).toEqual(expect.any(String));
    expect(result.timestamp).toEqual(expect.any(String));
  });

  it('returns version information', () => {
    const config = createConfigService({
      NODE_ENV: 'test',
      APP_VERSION: '0.1.0-test',
      APP_COMMIT_SHA: 'test-commit',
      APP_BUILD_TIME: '2026-07-10T00:00:00.000Z',
    });
    const prisma = createPrismaService();

    const service = new HealthService(config as any, prisma as any);

    const result = service.getVersion();

    expect(result.service).toBe('iam-crm-backend');
    expect(result.version).toBe('0.1.0-test');
    expect(result.commit).toBe('test-commit');
    expect(result.buildTime).toBe('2026-07-10T00:00:00.000Z');
    expect(result.nodeVersion).toEqual(expect.any(String));
  });

  it('returns readiness when database is up', async () => {
    const config = createConfigService({
      NODE_ENV: 'test',
    });
    const prisma = createPrismaService();

    const service = new HealthService(config as any, prisma as any);

    const result = await service.getReadiness();

    expect(result.status).toBe('ready');
    expect(result.checks.api.status).toBe('up');
    expect(result.checks.database.status).toBe('up');
    expect(result.checks.database.latencyMs).toEqual(expect.any(Number));
  });

  it('throws ServiceUnavailableException when database is down', async () => {
    const config = createConfigService({
      NODE_ENV: 'test',
    });
    const prisma = createPrismaService();
    prisma.$queryRaw.mockRejectedValueOnce(new Error('database is down'));

    const service = new HealthService(config as any, prisma as any);

    await expect(service.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});