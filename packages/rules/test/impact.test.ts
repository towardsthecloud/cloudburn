import { describe, expect, it } from 'vitest';
import type { FindingImpact } from '../src/index.js';
import { createFinancialEvidence, createFinding } from '../src/index.js';

describe('createFinancialEvidence', () => {
  it('keeps a valid exact measurement unchanged', () => {
    expect(createFinancialEvidence({ amount: 42.5, currency: 'EUR', period: 'month', confidence: 'exact' })).toEqual({
      confidence: 'exact',
      amount: 42.5,
      currency: 'EUR',
      period: 'month',
    });
  });

  it('keeps a valid estimated measurement unchanged', () => {
    expect(
      createFinancialEvidence({ amount: 12.34, currency: 'USD', period: 'month', confidence: 'estimated' }),
    ).toEqual({ confidence: 'estimated', amount: 12.34, currency: 'USD', period: 'month' });
  });

  it('keeps a known zero distinct from a missing amount', () => {
    expect(createFinancialEvidence({ amount: 0, currency: 'USD', period: 'month', confidence: 'estimated' })).toEqual({
      confidence: 'estimated',
      amount: 0,
      currency: 'USD',
      period: 'month',
    });

    for (const amount of [null, undefined]) {
      const evidence = createFinancialEvidence({ amount, currency: 'USD', period: 'month', confidence: 'estimated' });
      expect(evidence.confidence).toBe('unknown');
      expect(evidence).toEqual({
        confidence: 'unknown',
        currency: 'USD',
        period: 'month',
        reason: { code: 'missing_amount', message: 'The source did not provide a usable amount.' },
      });
      expect(Object.hasOwn(evidence, 'amount')).toBe(false);
      expect('amount' in JSON.parse(JSON.stringify(evidence))).toBe(false);
    }
  });

  it('rejects non-finite and negative amounts without substituting a figure', () => {
    for (const amount of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const evidence = createFinancialEvidence({ amount, currency: 'USD', period: 'month', confidence: 'estimated' });
      expect(evidence).toEqual({
        confidence: 'unknown',
        currency: 'USD',
        period: 'month',
        reason: { code: 'invalid_amount', message: 'The source amount is not finite and non-negative.' },
      });
      expect(Object.hasOwn(evidence, 'amount')).toBe(false);
    }
  });

  it('reports a missing currency without inventing one', () => {
    expect(createFinancialEvidence({ amount: 5, currency: null, period: 'month', confidence: 'estimated' })).toEqual({
      confidence: 'unknown',
      period: 'month',
      reason: { code: 'missing_currency', message: 'The source did not provide a currency.' },
    });
  });

  it('rejects an unsupported currency while preserving the supplied value', () => {
    expect(
      createFinancialEvidence({ amount: 5, currency: 'USD/GB', period: 'month', confidence: 'estimated' }),
    ).toEqual({
      confidence: 'unknown',
      currency: 'USD/GB',
      period: 'month',
      reason: { code: 'unsupported_currency', message: 'The currency must be a three-letter uppercase code.' },
    });
  });

  it('reports a missing period without inventing one', () => {
    expect(createFinancialEvidence({ amount: 5, currency: 'USD', confidence: 'estimated' })).toEqual({
      confidence: 'unknown',
      currency: 'USD',
      reason: { code: 'missing_period', message: 'The source did not provide a financial period.' },
    });
  });

  it('rejects an unsupported period while preserving valid supplied fields', () => {
    const evidence = createFinancialEvidence({
      amount: 5,
      currency: 'USD',
      period: 'GB-month',
      confidence: 'estimated',
    });
    expect(evidence).toEqual({
      confidence: 'unknown',
      currency: 'USD',
      reason: {
        code: 'unsupported_period',
        message: 'The financial period is not supported without conversion.',
      },
    });
    expect(Object.hasOwn(evidence, 'period')).toBe(false);
    expect(Object.hasOwn(evidence, 'amount')).toBe(false);
  });

  it('keeps unit-tagged values separate without conversion or aggregation', () => {
    const eur = createFinancialEvidence({ amount: 42.5, currency: 'EUR', period: 'month', confidence: 'estimated' });
    const usd = createFinancialEvidence({ amount: 42.5, currency: 'USD', period: 'month', confidence: 'estimated' });
    const hourly = createFinancialEvidence({ amount: 1, currency: 'USD', period: 'hour', confidence: 'estimated' });
    expect(eur).toEqual({ confidence: 'estimated', amount: 42.5, currency: 'EUR', period: 'month' });
    expect(usd).toEqual({ confidence: 'estimated', amount: 42.5, currency: 'USD', period: 'month' });
    expect(hourly).toEqual({ confidence: 'estimated', amount: 1, currency: 'USD', period: 'hour' });
  });
});

describe('FindingImpact', () => {
  it('round-trips only supplied window endpoints without inventing timestamps', () => {
    const impact: FindingImpact = {
      source: 'billing',
      window: { start: '2026-08-01T00:00:00.000Z' },
      currentCost: createFinancialEvidence({ amount: 200, currency: 'USD', period: 'month', confidence: 'exact' }),
      potentialSavings: createFinancialEvidence({
        amount: null,
        currency: 'USD',
        period: 'month',
        confidence: 'estimated',
      }),
    };
    const finding = createFinding(
      { id: 'CLDBRN-TEST-1', service: 'test', severity: 'low', message: 'm' },
      'discovery',
      [{ resourceId: 'res-1', impact }],
    );
    const serialized = JSON.parse(JSON.stringify(finding?.findings[0]?.impact));
    expect(serialized).toEqual(impact);
    expect(serialized.window).toEqual({ start: '2026-08-01T00:00:00.000Z' });
    expect(Object.hasOwn(serialized.window, 'end')).toBe(false);
    expect(Object.hasOwn(serialized, 'observedAt')).toBe(false);
    expect(Object.hasOwn(serialized, 'refreshedAt')).toBe(false);
  });

  it('supports a lookback-only window and mixed confidence per metric', () => {
    const impact: FindingImpact = {
      source: 'cloudburn',
      sourceDetail: 'aws-config-recording-frequency',
      window: { lookbackDays: 14 },
      currentCost: {
        confidence: 'unknown',
        currency: 'USD',
        period: 'month',
        reason: { code: 'not_provided', message: 'The dataset does not provide normalized current recording cost.' },
      },
      potentialSavings: createFinancialEvidence({
        amount: 11.06,
        currency: 'USD',
        period: 'month',
        confidence: 'estimated',
      }),
    };
    const serialized = JSON.parse(JSON.stringify(impact));
    expect(serialized.window).toEqual({ lookbackDays: 14 });
    expect(Object.hasOwn(serialized.window, 'start')).toBe(false);
    expect(serialized.potentialSavings.amount).toBe(11.06);
  });

  it('leaves findings without impact valid', () => {
    const finding = createFinding(
      { id: 'CLDBRN-TEST-1', service: 'test', severity: 'low', message: 'm' },
      'discovery',
      [{ resourceId: 'res-1' }],
    );
    expect(finding?.findings[0]).toEqual({ resourceId: 'res-1' });
  });
});
