import { isAbsolute } from 'node:path';
import { builtInRuleMetadata, type CloudBurnConfig, type Source } from '@cloudburn/sdk';
import * as z from 'zod';
import { InvalidArgumentError } from './error.js';

/** Rule selection arguments shared by the scan tools; they mirror the CLI's config override flags. */
export const ruleSelectionShape = {
  configPath: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Absolute path to a CloudBurn config file. Pass the project's .cloudburn.yml when it exists; without it, " +
        "CloudBurn searches upward from the server's working directory, which depends on the agent host.",
    ),
  enabledRules: z
    .array(z.string().min(1))
    .min(1)
    .optional()
    .describe('Rule IDs to check exclusively, for example ["CLDBRN-AWS-EBS-1"]. Defaults to the AWS Core preset.'),
  disabledRules: z
    .array(z.string().min(1))
    .min(1)
    .optional()
    .describe('Rule IDs to remove from the default AWS Core preset.'),
  services: z
    .array(z.string().min(1))
    .min(1)
    .optional()
    .describe('Services to include in the rule set, for example ["ec2", "s3"]. Use list_rules to see services.'),
};

/**
 * Rejects relative paths. Agent hosts start the server in different working directories, for example the project
 * root or the plugin cache, so a relative path would silently resolve against the wrong directory.
 *
 * @param value - Path argument supplied by the client, if any.
 * @param argument - Argument name used in the error message.
 * @returns Nothing when the path is absolute or omitted.
 * @throws InvalidArgumentError when the path is relative.
 */
export const requireAbsolutePath = (value: string | undefined, argument: string): void => {
  if (value !== undefined && !isAbsolute(value)) {
    throw new InvalidArgumentError(`${argument} must be an absolute path; received "${value}".`);
  }
};

/** Parsed rule selection arguments. */
export type RuleSelection = {
  disabledRules?: string[];
  enabledRules?: string[];
  services?: string[];
};

/**
 * Builds the SDK runtime config override for one scan mode, validating services against built-in rule metadata.
 *
 * @param mode - Scan mode whose rule set the selection narrows.
 * @param selection - Tool arguments that select rules and services.
 * @returns The mode-scoped config override, or `undefined` when the arguments select nothing.
 * @throws InvalidArgumentError when a service has no rules for the mode.
 */
export const toConfigOverride = (mode: Source, selection: RuleSelection): Partial<CloudBurnConfig> | undefined => {
  const { disabledRules, enabledRules } = selection;
  const services = selection.services?.map((service) => service.toLowerCase());

  if (enabledRules === undefined && disabledRules === undefined && services === undefined) {
    return undefined;
  }

  if (services !== undefined) {
    const validServices = new Set(
      builtInRuleMetadata.filter((rule) => rule.supports.includes(mode)).map((rule) => rule.service),
    );
    const invalidService = services.find((service) => !validServices.has(service));

    if (invalidService !== undefined) {
      throw new InvalidArgumentError(
        `Unknown service "${invalidService}" for ${mode}. Allowed services: ${Array.from(validServices).sort().join(', ')}.`,
      );
    }
  }

  const modeConfig = { disabledRules, enabledRules, services };
  return mode === 'iac' ? { iac: modeConfig } : { discovery: modeConfig };
};
