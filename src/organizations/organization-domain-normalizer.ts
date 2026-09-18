import { BadRequestException } from "@nestjs/common";
import { domainToASCII } from "node:url";

export function normalizeOrganizationHostname(input: string): string {
  const raw = input.trim().toLowerCase().replace(/\.$/, "");
  if (!raw || raw.includes("://") || /[/?#:@\s]/.test(raw))
    throw new BadRequestException("Invalid hostname");
  const hostname = domainToASCII(raw).toLowerCase();
  if (!hostname || hostname.length > 253 || hostname.split(".").length < 2)
    throw new BadRequestException("Invalid hostname");
  const labels = hostname.split(".");
  if (
    labels.some(
      (label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
    )
  )
    throw new BadRequestException("Invalid hostname");
  return hostname;
}
