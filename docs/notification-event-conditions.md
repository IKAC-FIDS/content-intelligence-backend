# Notification Event Conditions (Phase 9)

A notification rule now means:

`WHEN event occurs AND optional conditions match THEN recipients, preferences, channels and templates are processed.`

The processing order is:

`Event → candidate tenant rules → policy context → condition evaluation → recipient resolution → preferences/mandatory policy → channel availability → template → delivery`

Conditions decide **whether** a rule applies. Recipient rules decide **who** receives it. User preferences decide whether an optional channel is allowed. A mandatory rule may override the existing preference behavior. These responsibilities remain separate.

## Schema

```json
{
  "version": 1,
  "logic": "AND",
  "conditions": [
    { "field": "task.priority", "operator": "IN", "value": ["HIGH", "URGENT"] },
    {
      "logic": "OR",
      "conditions": [
        { "field": "task.status", "operator": "EQ", "value": "TODO" },
        { "field": "task.status", "operator": "EQ", "value": "IN_PROGRESS" }
      ]
    }
  ]
}
```

Supported operators are `EQ`, `NEQ`, `IN`, `NOT_IN`, `EXISTS`, `NOT_EXISTS`, `GT`, `GTE`, `LT` and `LTE`. Fields and operators must exist in the static condition catalog for the selected event. Values are never interpreted as JavaScript, SQL, Prisma filters or regular expressions.

Compatibility: `null`, `{}` and an empty `conditions` array retain the legacy event-name-only matching behavior.

Safety limits: maximum nesting depth 5, maximum 50 leaves, maximum 100 values per IN/NOT_IN, path length 120 and string length 500. Prototype-related path segments are rejected.

The admin UI intentionally edits a top-level AND list. The backend schema and evaluator support nested AND/OR groups for API clients and future UI expansion.
