import type { FinancialEvidence, ImpactPeriod } from './metadata.js';

const periods = new Set<string>(['hour', 'day', 'month', 'year']);

/**
 * Validates one source-supplied financial measurement into tagged evidence.
 *
 * This helper checks that the amount is finite and non-negative, the currency is
 * a three-letter uppercase code, and the period is supported. It performs no
 * price normalization, currency conversion, or aggregation: an invalid or
 * missing input becomes a `confidence: 'unknown'` value with a `reason`, never a
 * substituted figure such as zero.
 *
 * @param input - Source amount, currency, period, and the evidence confidence.
 * @returns Known financial evidence, or unknown evidence carrying a reason code.
 */
export const createFinancialEvidence = (input: {
  amount?: number | null;
  currency?: string | null;
  period?: string | null;
  confidence: 'exact' | 'estimated';
}): FinancialEvidence => {
  const { amount, currency, period, confidence } = input;
  const unknown = (code: string, message: string): FinancialEvidence => ({
    confidence: 'unknown',
    ...(currency ? { currency } : {}),
    ...(period && periods.has(period) ? { period: period as ImpactPeriod } : {}),
    reason: { code, message },
  });
  if (amount == null) return unknown('missing_amount', 'The source did not provide a usable amount.');
  if (!Number.isFinite(amount) || amount < 0)
    return unknown('invalid_amount', 'The source amount is not finite and non-negative.');
  if (!currency) return unknown('missing_currency', 'The source did not provide a currency.');
  if (!/^[A-Z]{3}$/.test(currency))
    return unknown('unsupported_currency', 'The currency must be a three-letter uppercase code.');
  if (!period) return unknown('missing_period', 'The source did not provide a financial period.');
  if (!periods.has(period))
    return unknown('unsupported_period', 'The financial period is not supported without conversion.');
  return { confidence, amount, currency, period: period as ImpactPeriod };
};
