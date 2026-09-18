import { BadRequestException, Injectable } from "@nestjs/common";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

@Injectable()
export class SsoNetworkSecurityService {
  assertPublicHttpsUrl(raw: string): URL {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException("Invalid SSO endpoint URL");
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !url.hostname
    )
      throw new BadRequestException(
        "SSO endpoints must use public HTTPS without embedded credentials",
      );
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      this.isBlockedIp(host)
    )
      throw new BadRequestException(
        "SSO endpoint destination is not permitted",
      );
    return url;
  }

  async assertResolvablePublicUrl(raw: string) {
    const url = this.assertPublicHttpsUrl(raw);
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (
      !addresses.length ||
      addresses.some((item) => this.isBlockedIp(item.address))
    )
      throw new BadRequestException(
        "SSO endpoint resolved to a blocked network",
      );
    return url;
  }

  async probe(raw: string) {
    const url = await this.assertResolvablePublicUrl(raw);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "application/json, application/xml, text/xml;q=0.8",
        },
      });
      const length = Number(response.headers.get("content-length") ?? 0);
      if (length > 1_048_576)
        throw new BadRequestException("SSO endpoint response is too large");
      if (response.status >= 300 && response.status < 400)
        throw new BadRequestException(
          "SSO endpoint redirects are not accepted",
        );
      return {
        reachable: response.ok,
        statusCode: response.status,
        endpointOrigin: url.origin,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException("SSO endpoint connection failed");
    } finally {
      clearTimeout(timer);
    }
  }

  private isBlockedIp(value: string) {
    if (!isIP(value)) return false;
    const ip = value.toLowerCase();
    if (
      ip === "::1" ||
      ip === "::" ||
      ip.startsWith("fe80:") ||
      ip.startsWith("fc") ||
      ip.startsWith("fd")
    )
      return true;
    const parts = ip.split(".").map(Number);
    return (
      parts.length === 4 &&
      (parts[0] === 10 ||
        parts[0] === 127 ||
        parts[0] === 0 ||
        (parts[0] === 169 && parts[1] === 254) ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168) ||
        (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
        parts[0] >= 224)
    );
  }
}
