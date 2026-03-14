import { builtInRuleMetadata, type Source } from '@cloudburn/sdk';
import { InvalidArgumentError } from 'commander';

const parseCommaSeparatedList = (value: string, itemLabel: string): string[] => {
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (items.length === 0) {
    throw new InvalidArgumentError(`Provide at least one ${itemLabel}.`);
  }

  return items;
};

/**
 * Parses a comma-separated list of rule IDs from a CLI flag.
 *
 * @param value - Raw CLI flag value.
 * @returns Normalized rule IDs in declaration order.
 */
export const parseRuleIdList = (value: string): string[] => {
  return parseCommaSeparatedList(value, 'rule ID');
};

/**
 * Parses a comma-separated list of service names from a CLI flag.
 *
 * @param value - Raw CLI flag value.
 * @returns Lower-cased service names in declaration order.
 */
export const parseServiceList = (value: string): string[] =>
  parseCommaSeparatedList(value, 'service').map((service) => service.toLowerCase());

/**
 * Parses a comma-separated list of source names from a CLI flag.
 *
 * @param value - Raw CLI flag value.
 * @returns Lower-cased source names in declaration order.
 */
export const parseSourceList = (value: string): Source[] =>
  parseCommaSeparatedList(value, 'source').map((source) => source.toLowerCase() as Source);

/**
 * Validates a mode-local service selection against built-in rule metadata.
 *
 * @param mode - Scan mode being configured.
 * @param services - Parsed service names, if any.
 * @returns The validated service names, unchanged.
 */
export const validateServiceList = (mode: 'discovery' | 'iac', services?: string[]): string[] | undefined => {
  if (services === undefined) {
    return undefined;
  }

  const validServices = new Set(
    builtInRuleMetadata.filter((rule) => rule.supports.includes(mode)).map((rule) => rule.service),
  );
  const invalidService = services.find((service) => !validServices.has(service));

  if (invalidService) {
    throw new InvalidArgumentError(
      `Unknown service "${invalidService}" for ${mode}. Allowed services: ${Array.from(validServices).sort().join(', ')}.`,
    );
  }

  return services;
};
