export { mapWithConcurrency } from '../../../utils/concurrency.js';
export { runAwsRequest as withAwsServiceErrorContext, withAwsServiceCallBudget } from '../request.js';

import { resolveAwsAccountId } from '../client.js';
import type { AwsAccountIdResolver } from '../discovery-registry.js';

/**
 * Resolves the AWS account ID through a discovery-run cache when available.
 *
 * @param context - Optional per-run account ID resolver.
 * @returns The current caller's AWS account ID.
 */
export const resolveAwsAccountIdForLoad = (context?: AwsAccountIdResolver): Promise<string> =>
  context?.resolveAccountId() ?? resolveAwsAccountId();

/**
 * Returns the first UTC instant of the calendar month containing a date.
 *
 * @param date - Date whose UTC month should be selected.
 * @returns The first day of that UTC month at midnight.
 */
export const toUtcMonthBoundary = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

/**
 * Moves a UTC month boundary by a whole number of calendar months.
 *
 * @param date - UTC month boundary to move.
 * @param months - Signed number of calendar months to add.
 * @returns The shifted UTC month boundary.
 */
export const addUtcMonths = (date: Date, months: number): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

/**
 * Formats a date as an AWS billing API UTC calendar date.
 *
 * @param date - Date to format.
 * @returns The UTC calendar date in YYYY-MM-DD form.
 */
export const formatUtcDate = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Parses a complete finite numeric string returned by an AWS API.
 *
 * @param value - Numeric string to parse.
 * @returns The finite number, or `null` when the value is missing or invalid.
 */
export const parseFiniteNumber = (value: string | undefined): number | null => {
  if (!value?.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Splits an array into fixed-size chunks for batched AWS API calls.
 *
 * @param items - Ordered items to batch.
 * @param size - Maximum number of items per batch.
 * @returns A list of contiguous batches.
 */
export const chunkItems = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

/**
 * Extracts the terminal identifier directly from an AWS ARN.
 *
 * Some Resource Explorer `name` fields are human-readable labels instead of
 * API identifiers, so loaders can use the ARN segment when the service
 * requires the canonical identifier.
 *
 * @param arn - Full AWS ARN for the discovered resource.
 * @returns The trailing ARN identifier, or `null` when the ARN is malformed.
 */
export const extractTerminalArnResourceIdentifier = (arn: string): string | null => {
  const match = /[:/]([^:/]+)$/u.exec(arn);

  return match?.[1] ?? null;
};

/**
 * Extracts the terminal identifier from a Resource Explorer result.
 *
 * Resource Explorer resource names are not guaranteed for every service, so
 * loaders can fall back to the last ARN segment when the name is absent.
 *
 * @param resourceName - Optional resource name reported by Resource Explorer.
 * @param arn - Full AWS ARN for the discovered resource.
 * @returns The terminal identifier, or `null` when neither source is usable.
 */
export const extractTerminalResourceIdentifier = (resourceName: string | undefined, arn: string): string | null => {
  if (resourceName) {
    return resourceName;
  }

  return extractTerminalArnResourceIdentifier(arn);
};
