/**
 * Normalize a literal string for case-insensitive provider comparisons.
 *
 * @param value - Candidate literal value.
 * @returns The lowercase literal, or null when the value is not a concrete string.
 */
export const getLiteralString = (value: unknown): string | null =>
  typeof value === 'string' && !value.includes('${') ? value.toLowerCase() : null;

/**
 * Normalize a literal numeric value from provider or IaC data.
 *
 * @param value - Candidate number or numeric string.
 * @returns The finite number, or null when the value is not concrete numeric data.
 */
export const getLiteralNumberish = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string' || value.includes('${')) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};
