export const NOTIFICATION_CONDITION_OPERATORS = ["EQ", "NEQ", "IN", "NOT_IN", "EXISTS", "NOT_EXISTS", "GT", "GTE", "LT", "LTE"] as const
export type NotificationConditionOperator = (typeof NOTIFICATION_CONDITION_OPERATORS)[number]
export type NotificationConditionLogic = "AND" | "OR"
export type NotificationConditionValue = string | number | boolean | null | Array<string | number | boolean | null>

export type NotificationConditionLeaf = { field: string; operator: NotificationConditionOperator; value?: NotificationConditionValue }
export type NotificationConditionGroup = { logic: NotificationConditionLogic; conditions: NotificationConditionNode[] }
export type NotificationConditionNode = NotificationConditionLeaf | NotificationConditionGroup
export type NotificationRuleConditions = { version: 1; logic: NotificationConditionLogic; conditions: NotificationConditionNode[] }

export type NotificationPolicyContext = {
  event: { name: string }
  actor: { id: string | null; roleId: string | null; teamId: string | null }
  organization: { id: string }
  task: null | { id: string; title: string; priority: string; status: string; dueAt?: string | null; assigneeId: string | null; teamId: string | null; creatorId: string | null }
  meeting: null | { id: string; title: string; type: string | null; status: string; startAt?: string; organizerId: string }
  opportunity: null | { id: string; title: string | null; priority: string | null; probability: number | null; stage: string | null; fromStage: string | null; toStage: string | null; ownerId: string | null }
  schedule?: null | { offsetMinutes: number; scheduledAt: string; detectedAt: string | null }
}

export type NotificationConditionFieldType = "string" | "number" | "boolean" | "enum" | "userId" | "teamId"
export type NotificationConditionFieldDefinition = { field: string; label: string; type: NotificationConditionFieldType; operators: NotificationConditionOperator[]; values?: string[]; control?: "select" | "text" | "number" }
export type NotificationConditionEventDefinition = { eventName: string; label: string; conditionFields: NotificationConditionFieldDefinition[] }

export type NotificationPolicyCheck = { field: string; operator: NotificationConditionOperator; expected?: NotificationConditionValue; result: boolean }
export type NotificationPolicyEvaluation = { matches: boolean; reason: "no_conditions" | "all_conditions_matched" | "condition_failed"; checks: NotificationPolicyCheck[] }

export function isConditionGroup(node: NotificationConditionNode): node is NotificationConditionGroup {
  return Object.prototype.hasOwnProperty.call(node, "logic")
}
