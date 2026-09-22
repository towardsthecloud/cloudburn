import { afterEach, describe, expect, it } from 'vitest';
import { getInputs } from '../src/inputs.js';

const INPUT_PREFIX = 'INPUT_';

const setInputs = (inputs: Record<string, string>): void => {
  for (const [name, value] of Object.entries(inputs)) {
    process.env[`${INPUT_PREFIX}${name}`] = value;
  }
};

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith(INPUT_PREFIX)) {
      delete process.env[key];
    }
  }
});

describe('getInputs', () => {
  it('defaults to a workspace scan with annotations and comment enabled', () => {
    const inputs = getInputs();
    expect(inputs.path).toBe('.');
    expect(inputs.annotations).toBe(true);
    expect(inputs.comment).toBe(true);
    expect(inputs.exitCode).toBe(false);
    expect(inputs.header).toBe('## CloudBurn scan');
    expect(inputs.failOn).toBeUndefined();
    expect(inputs.configPath).toBeUndefined();
    expect(inputs.scanOverride).toBeUndefined();
  });

  it('maps rule and service inputs into the iac scan override like the CLI flags', () => {
    setInputs({
      PATH: './iac',
      'ENABLED-RULES': 'CLDBRN-AWS-EBS-1, CLDBRN-AWS-S3-1',
      'DISABLED-RULES': 'CLDBRN-AWS-EC2-2',
      SERVICE: 'EC2, ebs',
      CONFIG: 'settings.yaml',
      TOKEN: 'token',
    });
    const inputs = getInputs();
    expect(inputs.path).toBe('./iac');
    expect(inputs.configPath).toBe('settings.yaml');
    expect(inputs.scanOverride).toEqual({
      iac: {
        enabledRules: ['CLDBRN-AWS-EBS-1', 'CLDBRN-AWS-S3-1'],
        disabledRules: ['CLDBRN-AWS-EC2-2'],
        services: ['ec2', 'ebs'],
      },
    });
  });

  it('parses fail-on and exit-code policy inputs', () => {
    setInputs({ 'FAIL-ON': 'High', 'EXIT-CODE': 'true' });
    const inputs = getInputs();
    expect(inputs.failOn).toBe('high');
    expect(inputs.exitCode).toBe(true);
  });

  it('rejects an unknown severity', () => {
    setInputs({ 'FAIL-ON': 'critical' });
    expect(() => getInputs()).toThrow(/Unknown severity "critical"/);
  });

  it('rejects an empty comma-separated rule list', () => {
    setInputs({ 'ENABLED-RULES': ' , ' });
    expect(() => getInputs()).toThrow(/at least one rule ID/);
  });

  it('rejects a service that has no IaC rules', () => {
    setInputs({ SERVICE: 'not-a-service' });
    expect(() => getInputs()).toThrow(/Unknown service "not-a-service" for iac/);
  });

  it('rejects a non-boolean flag', () => {
    setInputs({ ANNOTATIONS: 'yes' });
    expect(() => getInputs()).toThrow(/does not meet YAML 1.2/);
  });
});
