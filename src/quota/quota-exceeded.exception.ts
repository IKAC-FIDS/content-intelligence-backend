import { HttpException, HttpStatus } from '@nestjs/common';
import { QuotaMetric } from '@prisma/client';

export class QuotaExceededException extends HttpException {
  constructor(
    metric: QuotaMetric,
    current: bigint,
    requested: bigint,
    limit: bigint,
    resetAt: Date | null,
  ) {
    super(
      {
        code: 'QUOTA_EXCEEDED',
        message: 'Organization quota has been exceeded',
        details: {
          metric,
          current: current.toString(),
          requested: requested.toString(),
          limit: limit.toString(),
          resetAt: resetAt?.toISOString() ?? null,
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
