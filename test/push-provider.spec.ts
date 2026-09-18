import { BadRequestException } from "@nestjs/common"
import * as webpush from "web-push"
import { PushProviderRegistry } from "../src/notification-core/push/push-provider.registry"
import { WebPushProvider } from "../src/notification-core/push/web-push.provider"

jest.mock("web-push", () => ({ sendNotification: jest.fn() }))

const config = { publicKey: "public", privateKey: "private", subject: "mailto:admin@example.com", timeoutMs: 5000 }
const input = { recipientUserId: "user-1", subscription: { endpoint: "https://push.example.test/id", keys: { p256dh: "key", auth: "auth" } }, title: "عنوان", body: "متن", actionUrl: "/tasks/1" }

describe("WebPushProvider", () => {
  const provider = new WebPushProvider()
  beforeEach(() => jest.resetAllMocks())
  it("returns a sanitized success", async () => {
    jest.mocked(webpush.sendNotification).mockResolvedValue({ statusCode: 201, headers: { location: "message-1" }, body: "" })
    await expect(provider.send(input, config)).resolves.toMatchObject({ success: true, providerMessageId: "message-1", providerStatus: "201" })
  })
  it.each([[410, "INVALID_PUSH_ENDPOINT", true], [401, "PROVIDER_AUTH_FAILED", false], [500, "HTTP_500", false]])("maps provider status %s", async (statusCode, errorCode, invalidEndpoint) => {
    jest.mocked(webpush.sendNotification).mockRejectedValue({ statusCode })
    await expect(provider.send(input, config)).resolves.toMatchObject({ success: false, errorCode, invalidEndpoint })
  })
  it("maps timeout and does not leak the provider error", async () => {
    jest.mocked(webpush.sendNotification).mockRejectedValue(Object.assign(new Error("secret-private-key"), { name: "TimeoutError" }))
    const result = await provider.send(input, config)
    expect(result).toMatchObject({ success: false, errorCode: "PROVIDER_TIMEOUT" })
    expect(JSON.stringify(result)).not.toContain("secret-private-key")
  })
  it("maps a malformed provider response without leaking details", async () => {
    jest.mocked(webpush.sendNotification).mockResolvedValue(undefined as never)
    const result = await provider.send(input, config)
    expect(result).toMatchObject({ success: false, errorCode: "PROVIDER_NETWORK_ERROR" })
    expect(JSON.stringify(result)).not.toContain(config.privateKey)
  })
})

describe("PushProviderRegistry", () => {
  const provider = new WebPushProvider()
  const registry = new PushProviderRegistry(provider)
  it("resolves a registered provider", () => expect(registry.get("WEB_PUSH")).toBe(provider))
  it("rejects unknown providers", () => expect(() => registry.get("UNKNOWN")).toThrow(BadRequestException))
})
