import { of } from 'rxjs';
import { ApiUsageInterceptor } from '../src/quota/api-usage.interceptor';
function context(request: any) {
  return { switchToHttp: () => ({ getRequest: () => request }) } as any;
}
describe('ApiUsageInterceptor fix 000093', () => {
  it('meters an authenticated tenant request using requestId idempotency', async () => {
    const quota: any = {
      consumeEvent: jest.fn().mockResolvedValue({ consumed: true }),
    };
    const interceptor = new ApiUsageInterceptor(quota);
    const next: any = { handle: jest.fn(() => of('ok')) };
    await interceptor.intercept(
      context({
        originalUrl: '/api/companies',
        method: 'GET',
        requestId: 'r1',
        user: { tenantContext: { organizationId: 'org-a', userId: 'u1' } },
      }),
      next,
    );
    expect(quota.consumeEvent).toHaveBeenCalledWith(
      'org-a',
      'API_CALLS',
      1n,
      'http:r1',
      expect.any(Date),
      'u1',
      'r1',
    );
  });
  it.each([
    {
      originalUrl: '/api/health',
      user: { tenantContext: { organizationId: 'org-a' } },
    },
    { originalUrl: '/api/auth/login' },
    { originalUrl: '/api/admin/plans', user: { userId: 'platform-a' } },
  ])('does not meter excluded/no-tenant request %#', async (request) => {
    const quota: any = { consumeEvent: jest.fn() };
    const interceptor = new ApiUsageInterceptor(quota);
    await interceptor.intercept(context({ method: 'GET', ...request }), {
      handle: () => of('ok'),
    } as any);
    expect(quota.consumeEvent).not.toHaveBeenCalled();
  });
});
