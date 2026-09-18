import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { PlatformScopeContext } from '../tenant/tenant-context.types';

export const CurrentPlatform = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PlatformScopeContext =>
    context.switchToHttp().getRequest().platformContext,
);
