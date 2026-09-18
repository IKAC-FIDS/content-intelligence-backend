import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('fix 000095-C quota OpenAPI runtime alignment', () => {
  const document = JSON.parse(readFileSync(resolve('openapi/openapi.json'), 'utf8'));

  it('uses the runtime QuotaSummary field names', () => {
    const summary = document.components.schemas.QuotaSummary;
    expect(summary.required).toEqual(['organizationId', 'generatedAt', 'metrics']);
    expect(summary.properties.generatedAt).toMatchObject({ type: 'string', format: 'date-time' });
    expect(summary.properties.metrics.items.$ref).toBe('#/components/schemas/QuotaSummaryMetric');
    expect(summary.properties).not.toHaveProperty('quotas');
  });

  it('models every runtime metric field with source enums', () => {
    const metric = document.components.schemas.QuotaSummaryMetric;
    expect(metric.required).toEqual(['metric', 'state', 'current', 'softLimit', 'hardLimit', 'resetPeriod', 'resetAt', 'threshold']);
    expect(metric.properties.metric.$ref).toBe('#/components/schemas/QuotaMetric');
    expect(metric.properties.state.$ref).toBe('#/components/schemas/QuotaConfigurationState');
    expect(metric.properties.resetPeriod.$ref).toBe('#/components/schemas/QuotaResetPeriod');
    expect(metric.properties.resetAt).toMatchObject({ format: 'date-time', nullable: true });
    expect(metric.properties.threshold).toMatchObject({ type: 'number', nullable: true });
  });

  it('keeps quota/current linked to the corrected schema', () => {
    const schema = document.paths['/api/quota/current'].get.responses['200'].content['application/json'].schema;
    expect(schema.allOf[1].properties.data.$ref).toBe('#/components/schemas/QuotaSummary');
  });
});
