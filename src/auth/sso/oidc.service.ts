import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  OrganizationMembershipStatus,
  OrganizationStatus,
  Prisma,
  SsoProvider,
  SsoProviderType,
  SsoRoutingKind,
  UserRole,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { Issuer, custom, generators } from "openid-client";
import { AuditLogService } from "../../audit-log/audit-log.service";
import { PrismaService } from "../../prisma/prisma.service";
import { SsoNetworkSecurityService } from "./sso-network-security.service";
import { SsoSecretService } from "./sso-secret.service";
import { SsoTicketService } from "./sso-ticket.service";

type Identity = {
  subject: string;
  email: string;
  fullName: string;
  groups: string[];
};

@Injectable()
export class OidcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly secrets: SsoSecretService,
    private readonly tickets: SsoTicketService,
    private readonly audit: AuditLogService,
    private readonly network: SsoNetworkSecurityService,
  ) {}

  async buildAuthorizationUrl(
    providerId: string,
    kind: "DOMAIN" | "SUBDOMAIN",
    rawRoute: string,
  ) {
    const route = rawRoute
      .trim()
      .toLowerCase()
      .replace(/^\.+|\.+$/g, "");
    if (!route)
      throw new BadRequestException("Verified tenant route is required");
    const provider = await this.prisma.ssoProvider.findFirst({
      where: {
        id: providerId,
        type: SsoProviderType.OIDC,
        isActive: true,
        organization: { status: OrganizationStatus.ACTIVE },
        routes: { some: { kind: SsoRoutingKind[kind], value: route } },
      },
    });
    if (!provider?.organizationId)
      throw new BadRequestException("SSO provider not found or inactive");
    const client = await this.createClient(provider);
    const state = generators.state();
    const nonce = generators.nonce();
    const verifier = generators.codeVerifier();
    const challenge = generators.codeChallenge(verifier);
    await this.prisma.ssoAuthTransaction.create({
      data: {
        stateHash: this.hash(state),
        organizationId: provider.organizationId,
        providerId: provider.id,
        nonceEnc: this.secrets.encryptSecret(nonce),
        pkceVerifierEnc: this.secrets.encryptSecret(verifier),
        redirectTarget: this.frontendUrl(),
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    return client.authorizationUrl({
      scope: this.scopes(provider.scopes),
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
  }

  async handleCallback(providerId: string, query: Record<string, string>) {
    const frontend = this.frontendUrl();
    try {
      const state = query.state;
      if (!state) throw new BadRequestException("Missing OIDC state");
      const transaction = await this.consume(state);
      if (
        transaction.providerId !== providerId ||
        transaction.organizationId !== transaction.provider.organizationId
      )
        throw new BadRequestException("Invalid OIDC provider state");
      const provider = transaction.provider;
      if (
        !provider.organizationId ||
        !provider.isActive ||
        provider.type !== SsoProviderType.OIDC ||
        provider.organization?.status !== OrganizationStatus.ACTIVE
      )
        throw new BadRequestException("SSO provider not found or inactive");
      const nonce = transaction.nonceEnc
        ? this.secrets.decryptSecret(transaction.nonceEnc)
        : undefined;
      const verifier = transaction.pkceVerifierEnc
        ? this.secrets.decryptSecret(transaction.pkceVerifierEnc)
        : undefined;
      if (!nonce || !verifier)
        throw new BadRequestException("OIDC transaction is incomplete");
      const client = await this.createClient(provider);
      const tokenSet = await client.callback(
        this.redirectUri(provider.id),
        query,
        { state, nonce, code_verifier: verifier },
      );
      const claims = tokenSet.claims() as Record<string, unknown>;
      let email = typeof claims.email === "string" ? claims.email : undefined;
      let fullName = typeof claims.name === "string" ? claims.name : undefined;
      let groups = this.groups(claims[provider.groupsAttribute ?? "groups"]);
      if (!email || !fullName) {
        const userInfo = (await client.userinfo(
          tokenSet.access_token as string,
        )) as Record<string, unknown>;
        email ||=
          typeof userInfo.email === "string" ? userInfo.email : undefined;
        fullName ||=
          typeof userInfo.name === "string" ? userInfo.name : undefined;
        if (!groups.length)
          groups = this.groups(userInfo[provider.groupsAttribute ?? "groups"]);
      }
      if (typeof claims.sub !== "string" || !email)
        throw new UnauthorizedException("OIDC identity is incomplete");
      const identity: Identity = {
        subject: claims.sub,
        email: email.trim().toLowerCase(),
        fullName: fullName?.trim() || email,
        groups,
      };
      const user = await this.resolveIdentity(provider, identity);
      const ticket = await this.tickets.createTicket(user.id, provider.id);
      await this.audit.record({
        actorId: user.id,
        organizationId: provider.organizationId,
        entityType: "SsoProvider",
        entityId: provider.id,
        action: "sso.oidc.login.success",
      });
      return this.append(frontend, { ticket, providerId: provider.id });
    } catch (error) {
      await this.audit.record({
        organizationId: null,
        entityType: "SsoProvider",
        entityId: providerId,
        action: "sso.oidc.login.failed",
        metadata: { category: this.failureCategory(error) },
      });
      return this.append(frontend, { error: "oidc_login_failed" });
    }
  }

  private async consume(state: string) {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.ssoAuthTransaction.findUnique({
        where: { stateHash: this.hash(state) },
        include: { provider: { include: { organization: true } } },
      });
      if (!found || found.consumedAt || found.expiresAt <= new Date())
        throw new BadRequestException("Invalid or expired OIDC state");
      const consumed = await tx.ssoAuthTransaction.updateMany({
        where: {
          id: found.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1)
        throw new BadRequestException("OIDC state has already been consumed");
      return found;
    });
  }

  private async resolveIdentity(provider: SsoProvider, identity: Identity) {
    if (!provider.organizationId)
      throw new UnauthorizedException(
        "Provider tenant ownership is incomplete",
      );
    const organizationId = provider.organizationId;
    this.allowedDomain(identity.email, provider.allowedDomains);
    const roleId = await this.mappedRole(provider.id, identity.groups);
    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
    return this.prisma.$transaction(
      async (tx) => {
        const linked = await tx.externalIdentity.findUnique({
          where: {
            providerId_subject: {
              providerId: provider.id,
              subject: identity.subject,
            },
          },
          include: { user: true },
        });
        let user =
          linked?.user ??
          (await tx.user.findUnique({ where: { email: identity.email } }));
        if (user && !user.isActive)
          throw new UnauthorizedException("SSO user is inactive");
        if (!user && !provider.autoProvision)
          throw new UnauthorizedException("SSO auto-provisioning is disabled");
        if (!user)
          user = await tx.user.create({
            data: {
              email: identity.email,
              fullName: identity.fullName,
              passwordHash,
              role: UserRole.REP,
              organizationId,
              isActive: true,
            },
          });
        const membership = await tx.organizationMembership.findUnique({
          where: { userId_organizationId: { userId: user.id, organizationId } },
        });
        if (
          membership &&
          membership.status !== OrganizationMembershipStatus.ACTIVE
        )
          throw new UnauthorizedException("SSO membership is inactive");
        if (!membership) {
          if (!provider.autoProvision)
            throw new UnauthorizedException(
              "SSO membership is not provisioned",
            );
          await tx.organizationMembership.create({
            data: {
              userId: user.id,
              organizationId,
              roleId,
              status: OrganizationMembershipStatus.ACTIVE,
              isDefault: false,
              joinedAt: new Date(),
            },
          });
        }
        if (!linked)
          await tx.externalIdentity.create({
            data: {
              providerId: provider.id,
              userId: user.id,
              subject: identity.subject,
              email: identity.email,
            },
          });
        return user;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async mappedRole(providerId: string, groups: string[]) {
    if (!groups.length) return null;
    const mappings = await this.prisma.ssoGroupRoleMapping.findMany({
      where: { providerId, normalizedGroup: { in: groups } },
      select: { roleId: true },
    });
    const roleIds = [...new Set(mappings.map((item) => item.roleId))];
    if (roleIds.length > 1)
      throw new UnauthorizedException("Conflicting SSO group mappings");
    return roleIds[0] ?? null;
  }

  private async createClient(
    provider: Pick<
      SsoProvider,
      | "id"
      | "issuer"
      | "clientId"
      | "clientSecretEnc"
      | "authorizationUrl"
      | "tokenUrl"
      | "userInfoUrl"
      | "jwksUrl"
    >,
  ) {
    if (
      !provider.issuer ||
      !provider.clientId ||
      !provider.authorizationUrl ||
      !provider.tokenUrl ||
      !provider.jwksUrl
    )
      throw new BadRequestException("OIDC provider is not fully configured");
    const [issuerUrl, authorizationUrl, tokenUrl, jwksUrl] = await Promise.all([
      this.network.assertResolvablePublicUrl(provider.issuer),
      this.network.assertResolvablePublicUrl(provider.authorizationUrl),
      this.network.assertResolvablePublicUrl(provider.tokenUrl),
      this.network.assertResolvablePublicUrl(provider.jwksUrl),
    ]);
    const userInfoUrl = provider.userInfoUrl
      ? await this.network.assertResolvablePublicUrl(provider.userInfoUrl)
      : undefined;
    if (
      [authorizationUrl, tokenUrl, jwksUrl, userInfoUrl]
        .filter(Boolean)
        .some((url) => url!.origin !== issuerUrl.origin)
    )
      throw new BadRequestException(
        "OIDC endpoint origin does not match issuer",
      );
    custom.setHttpOptionsDefaults({ timeout: 5000 });
    const issuer = new Issuer({
      issuer: issuerUrl.toString(),
      authorization_endpoint: authorizationUrl.toString(),
      token_endpoint: tokenUrl.toString(),
      jwks_uri: jwksUrl.toString(),
      userinfo_endpoint: userInfoUrl?.toString(),
    });
    return new issuer.Client({
      client_id: provider.clientId,
      client_secret: provider.clientSecretEnc
        ? this.secrets.decryptSecret(provider.clientSecretEnc)
        : undefined,
      redirect_uris: [this.redirectUri(provider.id)],
      response_types: ["code"],
    });
  }

  private allowedDomain(email: string, allowed: string[]) {
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain || (allowed.length && !allowed.includes(domain)))
      throw new UnauthorizedException("SSO email domain is not allowed");
  }
  private groups(value: unknown) {
    const list = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? [value]
        : [];
    return [
      ...new Set(
        list
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
  }
  private hash(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }
  private scopes(value: string[]) {
    return [
      ...new Set(value.length ? value : ["openid", "profile", "email"]),
    ].join(" ");
  }
  private redirectUri(id: string) {
    return `${this.config.get<string>("BACKEND_PUBLIC_URL", "http://localhost:3000").replace(/\/$/, "")}/api/auth/oidc/${id}/callback`;
  }
  private frontendUrl() {
    return this.config.get<string>(
      "FRONTEND_SSO_CALLBACK_URL",
      "http://localhost:5173/auth/sso/callback",
    );
  }
  private append(base: string, params: Record<string, string>) {
    const url = new URL(base);
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.set(key, value),
    );
    return url.toString();
  }
  private failureCategory(error: unknown) {
    return error instanceof UnauthorizedException
      ? "IDENTITY_REJECTED"
      : error instanceof BadRequestException
        ? "PROTOCOL_REJECTED"
        : "INTERNAL_FAILURE";
  }
}
