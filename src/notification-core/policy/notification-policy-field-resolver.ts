import type { NotificationPolicyContext } from "./notification-policy.types"

const forbidden = new Set(["__proto__", "prototype", "constructor"])
const safePath = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*){1,4}$/

export function resolveNotificationPolicyField(context: NotificationPolicyContext, path: string): unknown {
  if (path.length > 120 || !safePath.test(path)) return undefined
  const parts = path.split(".")
  if (parts.some(part => forbidden.has(part))) return undefined
  let current: unknown = context
  for (const part of parts) {
    if (current === null || typeof current !== "object" || Array.isArray(current) || !Object.prototype.hasOwnProperty.call(current, part)) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}
