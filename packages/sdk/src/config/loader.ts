import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseDocument } from 'yaml';
import type { CloudBurnConfig } from '../types.js';
import { mergeConfig } from './merge.js';

const CLOUDBURN_YAML_FILENAMES = ['.cloudburn.yml', '.cloudburn.yaml'] as const;
const TOP_LEVEL_KEYS = new Set(['discovery', 'iac']);
const MODE_KEYS = new Set(['disabled-rules', 'enabled-rules', 'format', 'services']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const normalizeRuleList = (value: unknown, fieldName: string): string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`Config ${fieldName} must be an array of rule IDs.`);
  }

  return value.map((ruleId) => {
    if (typeof ruleId !== 'string' || ruleId.trim().length === 0) {
      throw new Error(`Config ${fieldName} must contain non-empty rule IDs.`);
    }

    return ruleId.trim();
  });
};

const normalizeServiceList = (value: unknown, fieldName: string): string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`Config ${fieldName} must be an array of services.`);
  }

  return value.map((service) => {
    if (typeof service !== 'string' || service.trim().length === 0) {
      throw new Error(`Config ${fieldName} must contain non-empty services.`);
    }

    return service.trim().toLowerCase();
  });
};

const normalizeModeConfig = (mode: 'discovery' | 'iac', value: unknown): Partial<CloudBurnConfig>[typeof mode] => {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`Config ${mode} must be a mapping.`);
  }

  for (const key of Object.keys(value)) {
    if (!MODE_KEYS.has(key)) {
      throw new Error(`Unknown config key "${mode}.${key}".`);
    }
  }

  return {
    disabledRules: normalizeRuleList(value['disabled-rules'], `${mode}.disabled-rules`),
    enabledRules: normalizeRuleList(value['enabled-rules'], `${mode}.enabled-rules`),
    format: value.format as CloudBurnConfig[typeof mode]['format'],
    services: normalizeServiceList(value.services, `${mode}.services`),
  };
};

const normalizeConfig = (value: unknown): Partial<CloudBurnConfig> => {
  if (!isRecord(value)) {
    throw new Error('CloudBurn config must be a mapping.');
  }

  for (const key of Object.keys(value)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      throw new Error(`Unknown config key "${key}".`);
    }
  }

  return {
    discovery: normalizeModeConfig('discovery', value.discovery),
    iac: normalizeModeConfig('iac', value.iac),
  };
};

const ensureSingleConfigFile = async (directory: string): Promise<string | undefined> => {
  const configPaths = await Promise.all(
    CLOUDBURN_YAML_FILENAMES.map(async (filename) => {
      const path = join(directory, filename);

      return (await fileExists(path)) ? path : undefined;
    }),
  );
  const existingPaths = configPaths.filter((path): path is string => path !== undefined);

  if (existingPaths.length > 1) {
    throw new Error('Found both .cloudburn.yml and .cloudburn.yaml in the same directory.');
  }

  return existingPaths[0];
};

const isGitRoot = async (directory: string): Promise<boolean> => fileExists(join(directory, '.git'));

const findConfigPath = async (startDirectory: string): Promise<string | undefined> => {
  let currentDirectory = resolve(startDirectory);

  while (true) {
    const configPath = await ensureSingleConfigFile(currentDirectory);

    if (configPath) {
      return configPath;
    }

    const parentDirectory = dirname(currentDirectory);

    if ((await isGitRoot(currentDirectory)) || parentDirectory === currentDirectory) {
      return undefined;
    }

    currentDirectory = parentDirectory;
  }
};

const parseConfigFile = async (path: string): Promise<Partial<CloudBurnConfig>> => {
  const document = parseDocument(await readFile(path, 'utf8'));

  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error) => error.message).join('\n'));
  }

  return normalizeConfig(document.toJS());
};

// Intent: load CloudBurn config from disk and normalize the structure.
export const loadConfig = async (path?: string): Promise<CloudBurnConfig> => {
  const resolvedPath = path ? resolve(path) : await findConfigPath(process.cwd());

  if (resolvedPath === undefined) {
    return mergeConfig();
  }

  if (!(await fileExists(resolvedPath))) {
    throw new Error(`CloudBurn config file not found: ${resolvedPath}`);
  }

  await ensureSingleConfigFile(dirname(resolvedPath));

  return mergeConfig(await parseConfigFile(resolvedPath));
};
