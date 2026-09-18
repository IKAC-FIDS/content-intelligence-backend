# Notification Push Channel

Phase 7 implements Web Push behind provider-neutral `PushProvider` and `PushProviderRegistry` contracts. Notification Core and the Rule Engine only know the `PUSH` channel. The handler renders the active PUSH template, resolves the centralized internal action URL, fans out to every active endpoint, and delegates transport to the configured provider.

## Delivery policy

- No active endpoint: `SKIPPED / NO_PUSH_ENDPOINT`.
- At least one endpoint succeeds: `SENT`; partial failure is recorded in `failureMessage`.
- All endpoints fail: `FAILED`.
- HTTP 404/410 permanently deactivates the affected endpoint.
- Delivery is atomically claimed before external sends, preventing concurrent duplicate sends.
- `DELIVERED` is not used because Web Push does not provide end-device delivery confirmation.

Endpoint subscription JSON and the VAPID private key are encrypted at rest using the existing secret encryption service. GET APIs return only safe status and the public VAPID key. Endpoint URLs and authentication keys are never returned by list/history APIs or written to logs.

## Web Push setup

Generate keys locally with `npx web-push generate-vapid-keys`, then enter the public key, private key and a `mailto:` or HTTPS subject in Notifications > Channels > Push. Users explicitly enable their current browser from Account > Security. Browser permission is never requested automatically.

The service worker accepts only same-origin relative action paths and focuses an existing CRM window when possible.
