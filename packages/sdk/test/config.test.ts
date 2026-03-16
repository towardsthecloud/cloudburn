import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/loader.js';
import { mergeConfig } from '../src/config/merge.js';

const tempDirectories: string[] = [];
const originalCwd = process.cwd();

const createTempDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'cloudburn-config-'));
  tempDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  process.chdir(originalCwd);

  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    }),
  );
});

describe('config loader', () => {
  it('loads default config when no config file is present', async () => {
    const directory = await createTempDirectory();

    process.chdir(directory);

    await expect(loadConfig()).resolves.toEqual({
      discovery: {},
      iac: {},
    });
  });

  it('loads an explicit yaml config path and normalizes hyphenated keys', async () => {
    const directory = await createTempDirectory();
    const configPath = join(directory, '.cloudburn.yaml');

    await writeFile(
      configPath,
      `iac:
  enabled-rules:
    - CLDBRN-AWS-EBS-1
  disabled-rules:
    - CLDBRN-AWS-EC2-2
  services:
    - "  ec2  "
    - ebs
  format: table
discovery:
  disabled-rules:
    - CLDBRN-AWS-S3-1
  services:
    - rds
  format: json
`,
      'utf8',
    );

    await expect(loadConfig(configPath)).resolves.toEqual({
      discovery: {
        disabledRules: ['CLDBRN-AWS-S3-1'],
        format: 'json',
        services: ['rds'],
      },
      iac: {
        disabledRules: ['CLDBRN-AWS-EC2-2'],
        enabledRules: ['CLDBRN-AWS-EBS-1'],
        format: 'table',
        services: ['ec2', 'ebs'],
      },
    });
  });

  it('trims whitespace around validated rule ids before returning config', async () => {
    const directory = await createTempDirectory();
    const configPath = join(directory, '.cloudburn.yml');

    await writeFile(
      configPath,
      `iac:
  enabled-rules:
    - "  CLDBRN-AWS-EBS-1  "
  disabled-rules:
    - " CLDBRN-AWS-EC2-2 "
  services:
    - "  EC2  "
`,
      'utf8',
    );

    await expect(loadConfig(configPath)).resolves.toEqual({
      discovery: {},
      iac: {
        disabledRules: ['CLDBRN-AWS-EC2-2'],
        enabledRules: ['CLDBRN-AWS-EBS-1'],
        services: ['ec2'],
      },
    });
  });

  it('walks upward to find the nearest config file and stops at the repository root', async () => {
    const rootDirectory = await createTempDirectory();
    const nestedDirectory = join(rootDirectory, 'packages', 'cloudburn');

    await mkdir(join(rootDirectory, '.git'));
    await mkdir(nestedDirectory, { recursive: true });
    await writeFile(
      join(rootDirectory, '.cloudburn.yml'),
      `discovery:
  format: table
`,
      'utf8',
    );

    process.chdir(nestedDirectory);

    await expect(loadConfig()).resolves.toEqual({
      discovery: {
        format: 'table',
      },
      iac: {},
    });
  });

  it('fails when both .cloudburn.yml and .cloudburn.yaml exist in the same directory', async () => {
    const directory = await createTempDirectory();

    await writeFile(join(directory, '.cloudburn.yml'), 'iac: {}\n', 'utf8');
    await writeFile(join(directory, '.cloudburn.yaml'), 'discovery: {}\n', 'utf8');

    process.chdir(directory);

    await expect(loadConfig()).rejects.toThrow('Found both .cloudburn.yml and .cloudburn.yaml');
  });

  it('fails on unknown keys, unknown rule ids, unsupported mode rule ids, and conflicting rule lists', async () => {
    const directory = await createTempDirectory();
    const configPath = join(directory, '.cloudburn.yml');

    await writeFile(
      configPath,
      `unexpected: true
discovery:
  enabled-rules:
    - CLDBRN-AWS-EC2-2
  disabled-rules:
    - CLDBRN-AWS-EC2-2
iac:
  disabled-rules:
    - CLDBRN-AWS-DOES-NOT-EXIST-1
`,
      'utf8',
    );

    await expect(loadConfig(configPath)).rejects.toThrow('unexpected');
  });

  it('merges per-mode runtime overrides without discarding untouched fields', () => {
    const merged = mergeConfig(
      {
        discovery: {
          disabledRules: ['CLDBRN-AWS-S3-1'],
          services: ['rds'],
        },
        iac: {
          enabledRules: ['CLDBRN-AWS-EBS-1'],
          services: ['ec2'],
        },
      },
      {
        discovery: {
          format: 'json',
          services: ['s3'],
        },
        iac: {
          disabledRules: ['CLDBRN-AWS-EC2-2'],
          format: 'table',
          services: ['ebs'],
        },
      },
    );

    expect(merged).toEqual({
      discovery: {
        disabledRules: ['CLDBRN-AWS-S3-1'],
        format: 'json',
        services: ['rds'],
      },
      iac: {
        disabledRules: ['CLDBRN-AWS-EC2-2'],
        enabledRules: ['CLDBRN-AWS-EBS-1'],
        format: 'table',
        services: ['ec2'],
      },
    });
  });

  it('fails when config format uses the removed text output', async () => {
    const directory = await createTempDirectory();
    const configPath = join(directory, '.cloudburn.yml');

    await writeFile(
      configPath,
      `discovery:
  format: text
`,
      'utf8',
    );

    await expect(loadConfig(configPath)).rejects.toThrow('Invalid format "text" in discovery.format.');
  });

  it('fails when config services contain unknown or unsupported mode values', async () => {
    const directory = await createTempDirectory();
    const configPath = join(directory, '.cloudburn.yml');

    await writeFile(
      configPath,
      `discovery:
  services:
    - unknown
iac:
  services:
    - lambda
`,
      'utf8',
    );

    await expect(loadConfig(configPath)).rejects.toThrow('unknown');
  });
});
