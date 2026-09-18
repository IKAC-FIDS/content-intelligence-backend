import { ValidationPipe } from "@nestjs/common";
import { AccountWorkspaceController } from "../src/account-workspace/account-workspace.controller";
import { AccountWorkspaceQueryDto } from "../src/account-workspace/dto/account-workspace-query.dto";

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

async function validateQuery(query: Record<string, unknown>) {
  return pipe.transform(query, {
    type: "query",
    metatype: AccountWorkspaceQueryDto,
  }) as Promise<AccountWorkspaceQueryDto>;
}

describe("account workspace", () => {
  it("validates the optional reporting period and applies the recent item default", async () => {
    await expect(
      validateQuery({ startDate: "2026-08-18", endDate: "2026-09-17" }),
    ).resolves.toEqual(
      expect.objectContaining({
        startDate: "2026-08-18",
        endDate: "2026-09-17",
        recentLimit: 5,
      }),
    );
    await expect(validateQuery({ recentLimit: "11" })).rejects.toThrow();
    await expect(validateQuery({ startDate: "not-a-date" })).rejects.toThrow();
  });

  it("passes only the authenticated user and validated query to the personal workspace service", async () => {
    const service = {
      getWorkspace: jest.fn().mockResolvedValue({ summary: {} }),
    };
    const controller = new AccountWorkspaceController(service as any);
    const query = await validateQuery({ recentLimit: "3" });
    const user = {
      userId: "00000000-0000-4000-8000-000000000012",
      email: "rep@example.com",
      role: "REP" as const,
      organizationId: "00000000-0000-4000-8000-000000000001",
    };

    await controller.getWorkspace(query, user);
    expect(service.getWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ recentLimit: 3 }),
      user,
    );
  });
});
