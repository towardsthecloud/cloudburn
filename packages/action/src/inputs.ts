import * as core from '@actions/core';
import { builtInRuleMetadata, type CloudBurnModeConfig, SEVERITIES, type Severity } from '@cloudburn/sdk';

/** Fully parsed action inputs, mirroring the CLI `scan` options. */
export type ActionInputs = {
  annotations: boolean;
  comment: boolean;
  configPath?: string;
  exitCode: boolean;
  failOn?: Severity;
  header: string;
  path: string;
  /** Runtime config overrides merged onto the loaded config, like `scan` flags. */
  scanOverride?: { iac: CloudBurnModeConfig };
  token: string;
};

const optionalInput = (name: string): string | undefined => {
  const value = core.getInput(name);
  return value === '' ? undefined : value;
};

const booleanInput = (name: string, fallback: boolean): boolean =>
  optionalInput(name) === undefined ? fallback : core.getBooleanInput(name);

const parseCommaSeparatedList = (value: string, itemLabel: string): string[] => {
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (items.length === 0) {
    throw new Error(`Provide at least one ${itemLabel} in "${value}".`);
  }

  return items;
};

const parseSeverity = (value: string): Severity => {
  const severity = value.toLowerCase() as Severity;
  if (!SEVERITIES.includes(severity)) {
    throw new Error(`Unknown severity "${value}". Allowed severities: ${SEVERITIES.join(', ')}.`);
  }
  return severity;
};

const parseIaCServiceList = (value: string): string[] => {
  const services = parseCommaSeparatedList(value, 'service').map((service) => service.toLowerCase());
  const validServices = new Set(
    builtInRuleMetadata.filter((rule) => rule.supports.includes('iac')).map((rule) => rule.service),
  );
  const invalidService = services.find((service) => !validServices.has(service));
  if (invalidService) {
    throw new Error(
      `Unknown service "${invalidService}" for iac. Allowed services: ${Array.from(validServices).sort().join(', ')}.`,
    );
  }
  return services;
};

/**
 * Reads action inputs into the same scan configuration shape the CLI produces.
 *
 * @returns Parsed and validated inputs; list and severity inputs throw on invalid values.
 */
export const getInputs = (): ActionInputs => {
  const enabledRules = optionalInput('enabled-rules');
  const disabledRules = optionalInput('disabled-rules');
  const service = optionalInput('service');

  const iac: CloudBurnModeConfig = {};
  if (enabledRules !== undefined) {
    iac.enabledRules = parseCommaSeparatedList(enabledRules, 'rule ID');
  }
  if (disabledRules !== undefined) {
    iac.disabledRules = parseCommaSeparatedList(disabledRules, 'rule ID');
  }
  if (service !== undefined) {
    iac.services = parseIaCServiceList(service);
  }

  const failOn = optionalInput('fail-on');

  return {
    annotations: booleanInput('annotations', true),
    comment: booleanInput('comment', true),
    configPath: optionalInput('config'),
    exitCode: booleanInput('exit-code', false),
    failOn: failOn === undefined ? undefined : parseSeverity(failOn),
    header: core.getInput('header') || '## CloudBurn scan',
    path: core.getInput('path') || '.',
    scanOverride: Object.keys(iac).length === 0 ? undefined : { iac },
    token: core.getInput('token'),
  };
};
