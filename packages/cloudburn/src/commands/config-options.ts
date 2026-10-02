import { type CloudBurnConfig, SEVERITIES, type Severity, type Source, validateServices } from '@cloudburn/sdk';
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
 * Parses and validates one severity value from a CLI flag.
 *
 * @param value - Raw CLI flag value.
 * @returns A normalized severity.
 */
export const parseSeverity = (value: string): Severity => {
  const severity = value.toLowerCase() as Severity;

  if (!SEVERITIES.includes(severity)) {
    throw new InvalidArgumentError(`Unknown severity "${value}". Allowed severities: ${SEVERITIES.join(', ')}.`);
  }

  return severity;
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
 * Creates a CLI flag parser for a comma-separated service list.
 *
 * @param mode - Scan mode whose built-in rules must cover each service; omit to accept any rule service.
 * @returns A parser that returns lower-cased, validated service names in declaration order.
 */
export const parseServiceList =
  (mode?: Source) =>
  (value: string): string[] => {
    const services = parseCommaSeparatedList(value, 'service');

    try {
      return validateServices(services, mode);
    } catch (err) {
      throw new InvalidArgumentError((err as Error).message);
    }
  };

/**
 * Parses a comma-separated list of source names from a CLI flag.
 *
 * @param value - Raw CLI flag value.
 * @returns Lower-cased source names in declaration order.
 */
export const parseSourceList = (value: string): Source[] =>
  parseCommaSeparatedList(value, 'source').map((source) => source.toLowerCase() as Source);

/**
 * Builds the runtime config override for the rule selection flags of one scan mode.
 *
 * @param mode - Scan mode whose rule set the flags narrow.
 * @param options - Parsed `--enabled-rules`, `--disabled-rules`, and `--service` values.
 * @returns The mode-scoped override, or `undefined` when no selection flag is set.
 */
export const toModeConfigOverride = (
  mode: Source,
  options: { disabledRules?: string[]; enabledRules?: string[]; service?: string[] },
): Partial<CloudBurnConfig> | undefined => {
  if (options.enabledRules === undefined && options.disabledRules === undefined && options.service === undefined) {
    return undefined;
  }

  const modeConfig = {
    disabledRules: options.disabledRules,
    enabledRules: options.enabledRules,
    services: options.service,
  };

  return mode === 'iac' ? { iac: modeConfig } : { discovery: modeConfig };
};
