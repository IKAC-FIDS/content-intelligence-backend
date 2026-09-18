# SMS notification channel

The notification core exposes an organization-scoped SMS channel. The first
provider is `GENERIC_HTTP_JSON`; additional providers implement `SmsProvider`
and are registered in `SmsProviderRegistry` without changing the dispatcher.

## Generic HTTP provider contract

The configured endpoint receives a `POST` request with this JSON body:

```json
{
  "to": "+989121234567",
  "message": "Rendered notification body",
  "sender": "Configured sender",
  "idempotencyKey": "notification-delivery-id"
}
```

The request includes `Authorization: Bearer <api-key>` and expects a successful
2xx JSON response shaped as:

```json
{
  "success": true,
  "messageId": "provider-message-id"
}
```

Production endpoints must use HTTPS. Plain HTTP is accepted only for localhost
development. Provider errors are reduced to controlled error codes; API keys,
message bodies, and complete recipient phone numbers are never logged.

## Configuration and dispatch

- Admin configuration: `GET/PATCH /admin/notification-channels/sms`
- Real test message: `POST /admin/notification-channels/sms/test`
- Explicit delivery dispatch: `POST /admin/notification-deliveries/:id/dispatch`
- Permission: `notification:manage`

Configuration belongs to the active organization. The API key is encrypted at
rest with the existing AES-GCM secret facility and is never returned by the
API. Omitting `apiKey` preserves it; `clearApiKey: true` removes it explicitly.

Dispatch atomically claims a pending delivery before contacting the provider.
This prevents duplicate sends when the same delivery is dispatched
concurrently. The handler uses the exact template stored on the delivery,
resolves and normalizes the recipient phone number, and persists the final
status plus provider message ID.

## Recipient resolution

The current data model does not contain a phone field on `User` or a direct
User-to-Person relation. Resolution therefore matches the recipient user's
email to a Person in a Company owned by the same organization, then prefers the
Person phone followed by primary MOBILE/PHONE/WORK_PHONE contacts. Missing or
invalid destinations are marked `SKIPPED` and are not sent.

## Message length

The channel sends the rendered body unchanged. It does not silently truncate
messages because truncation can change meaning. The admin UI displays the
character count; provider-specific segmentation and billing remain the
provider's responsibility.

## Adding another provider

1. Implement the `SmsProvider` interface in `src/notification-core/sms`.
2. Give the implementation a stable unique `code`.
3. Register it in `SmsProviderRegistry`.
4. Add focused tests for success, authentication failure, provider errors,
   malformed responses, timeouts, idempotency, and secret-safe logging.

