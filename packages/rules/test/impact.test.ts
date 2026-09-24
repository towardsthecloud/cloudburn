import { describe, expect, it } from 'vitest';
import { createFinancialEvidence } from '../src/index.js';

describe('createFinancialEvidence', () => {
  it('keeps a valid exact measurement unchanged', () => {
    expect(createFinancialEvidence({ amount: 42.5, currency: 'EUR', period: 'month', confidence: 'exact' })).toEqual({
      confidence: 'exact',
      amount: 42.5,
      currency: 'EUR',
      period: 'month',
    });
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
});
