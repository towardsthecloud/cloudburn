import { basename, isAbsolute } from 'node:path';
import { type CloudBurnConfig, type Source, validateServices as validateSdkServices } from '@cloudburn/sdk';
import * as z from 'zod';
import { InvalidArgumentError } from './error.js';

/** Rule selection arguments shared by the scan tools; they mirror the CLI's config override flags. */
export const ruleSelectionShape = {
  configPath: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Absolute path to the project's .cloudburn.yml or .cloudburn.yaml config file. Without it, " +
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

/**
 * Restricts config paths to the CloudBurn config filenames. YAML parse errors include source lines, so an
 * arbitrary file path, such as a credentials file, would leak its contents into the tool error shown to the model.
 *
 * @param value - Config path supplied by the client, if any.
 * @returns Nothing when the path is an absolute `.cloudburn.yml`/`.cloudburn.yaml` path or omitted.
 * @throws InvalidArgumentError when the path is relative or points to another filename.
 */
export const requireConfigFilePath = (value: string | undefined): void => {
  if (value === undefined) {
    return;
  }

  requireAbsolutePath(value, 'configPath');

  const filename = basename(value);

  if (filename !== '.cloudburn.yml' && filename !== '.cloudburn.yaml') {
    throw new InvalidArgumentError(
      `configPath must point to a .cloudburn.yml or .cloudburn.yaml file; received "${value}".`,
    );
  }
};

/** Parsed rule selection arguments. */
export type RuleSelection = {
  disabledRules?: string[];
  enabledRules?: string[];
  services?: string[];
};

/**
 * Normalizes service names and rejects services without built-in rules, so a typo fails instead of silently
 * selecting nothing.
 *
 * @param services - Service names supplied by the client.
 * @param mode - Scan mode whose rules must support the services; omit to accept any built-in rule service.
 * @returns Lower-cased service names in the supplied order.
 * @throws InvalidArgumentError when a service has no matching built-in rules.
 */
export const validateServices = (services: string[], mode?: Source): string[] => {
  try {
    return validateSdkServices(services, mode);
  } catch (err) {
    throw new InvalidArgumentError((err as Error).message);
  }
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

  if (enabledRules === undefined && disabledRules === undefined && selection.services === undefined) {
    return undefined;
  }

  const services = selection.services === undefined ? undefined : validateServices(selection.services, mode);
  const modeConfig = { disabledRules, enabledRules, services };
  return mode === 'iac' ? { iac: modeConfig } : { discovery: modeConfig };
};
