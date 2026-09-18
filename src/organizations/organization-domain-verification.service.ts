import { Injectable, RequestTimeoutException } from "@nestjs/common";
import { resolveTxt } from "node:dns/promises";

@Injectable()
export class OrganizationDomainVerificationService {
  async readTxt(hostname: string): Promise<string[]> {
    const timeout = new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new RequestTimeoutException("DNS verification timed out")),
        5_000,
      );
      timer.unref();
    });
    const rows = await Promise.race([resolveTxt(hostname), timeout]);
    return rows
      .map((parts) => parts.join(""))
      .filter((value) => value.length <= 512);
  }
}
