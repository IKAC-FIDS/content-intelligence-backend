import { ExecutionContext, StreamableFile } from "@nestjs/common";
import { CallHandler } from "@nestjs/common/interfaces";
import { lastValueFrom, of } from "rxjs";
import { ApiResponseInterceptor } from "../src/common/interceptors/api-response.interceptor";

describe("ApiResponseInterceptor", () => {
  const interceptor = new ApiResponseInterceptor();

  function context(requestId = "request-1") {
    return {
      switchToHttp: () => ({
        getResponse: () => ({
          getHeader: (name: string) =>
            name.toLowerCase() === "x-request-id" ? requestId : undefined,
        }),
      }),
    } as ExecutionContext;
  }

  async function intercept(payload: unknown) {
    const next = { handle: () => of(payload) } as CallHandler;
    return lastValueFrom(interceptor.intercept(context(), next));
  }

  it("lifts a pure paginated payload", async () => {
    const payload = { data: [{ id: "1" }], meta: { total: 1 } };
    await expect(intercept(payload)).resolves.toMatchObject({
      success: true,
      data: payload.data,
      meta: payload.meta,
      requestId: "request-1",
    });
  });

  it("wraps a normal object under data", async () => {
    const payload = { id: "1", name: "Example" };
    await expect(intercept(payload)).resolves.toMatchObject({
      success: true,
      data: payload,
      requestId: "request-1",
    });
  });

  it("wraps a composite report whole and preserves every report field", async () => {
    const payload = {
      asOf: "2026-07-21T00:00:00.000Z",
      summary: { activeOpportunityCount: 1 },
      buckets: [{ key: "DAYS_0_7", opportunityCount: 1 }],
      data: [{ id: "opportunity-1" }],
      meta: { total: 1, page: 1, limit: 20 },
    };
    const result = (await intercept(payload)) as Record<string, unknown>;

    expect(result).not.toHaveProperty("meta");
    expect(result.data).toEqual(payload);
    expect(result.data).toMatchObject({
      asOf: payload.asOf,
      summary: payload.summary,
      buckets: payload.buckets,
      data: payload.data,
      meta: payload.meta,
    });
  });

  it("leaves StreamableFile instances untouched", async () => {
    const file = new StreamableFile(Buffer.from("file"));
    await expect(intercept(file)).resolves.toBe(file);
  });

  it("leaves already standardized responses untouched", async () => {
    const response = { success: true, data: { id: "1" }, timestamp: "fixed" };
    await expect(intercept(response)).resolves.toBe(response);
  });

  it("keeps null response behavior unchanged", async () => {
    await expect(intercept(null)).resolves.toMatchObject({
      success: true,
      data: null,
      requestId: "request-1",
    });
  });
});
