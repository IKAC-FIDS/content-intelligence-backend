type Schema = Record<string, unknown>;

// CRM-specific response contracts were retired with the extracted CRM domain.
// Foundation endpoints are described from their controllers and DTO metadata.
export const RESPONSE_CONTRACT_SCHEMAS: Record<string, Schema> = {};

export const TYPED_SUCCESS_PAYLOADS: Record<
  string,
  { schema: Schema; paginated?: boolean }
> = {};
