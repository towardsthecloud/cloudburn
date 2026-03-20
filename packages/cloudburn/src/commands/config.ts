import { access, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Command } from 'commander';
import { EXIT_CODE_OK, EXIT_CODE_RUNTIME_ERROR } from '../exit-codes.js';
import { formatError } from '../formatters/error.js';
import { type OutputFormat, renderResponse } from '../formatters/output.js';
import { setCommandExamples } from '../help.js';

const CONFIG_FILENAMES = ['.cloudburn.yml', '.cloudburn.yaml'] as const;

const starterConfig = `# Static IaC scan configuration.
# enabled-rules restricts scans to only the listed rule IDs.
# disabled-rules removes specific rule IDs from the active set.
# services restricts scans to rules for the listed services.
# format sets the default output format when --format is not passed.
iac:
  enabled-rules:
    - CLDBRN-AWS-EBS-1
  disabled-rules:
    - CLDBRN-AWS-EC2-2
  services:
    - ebs
    - ec2
  format: table

# Live AWS discovery configuration.
# Use the same rule controls here to tune discover runs separately from IaC scans.
discovery:
  enabled-rules:
    - CLDBRN-AWS-EBS-1
  disabled-rules:
    - CLDBRN-AWS-S3-1
  services:
    - ebs
    - s3
  format: json
`;

type ConfigCommandOptions = {
  init?: boolean;
  path?: string;
  print?: boolean;
  printTemplate?: boolean;
};

const resolveExplicitOutputFormat = (command: Command): OutputFormat | undefined => {
  const options = typeof command.optsWithGlobals === 'function' ? command.optsWithGlobals() : command.opts();
  return options.format as OutputFormat | undefined;
};

const renderConfigDocument = (command: Command, content: string): string => {
  const explicitFormat = resolveExplicitOutputFormat(command);

  if (explicitFormat === undefined) {
    return content;
  }

  return renderResponse(
    {
      kind: 'document',
      content,
      contentType: 'application/yaml',
    },
    explicitFormat,
  );
};

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const ensureSingleConfigFile = async (directory: string): Promise<string | undefined> => {
  const configPaths = await Promise.all(
    CONFIG_FILENAMES.map(async (filename) => {
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

const findProjectRoot = async (startDirectory: string): Promise<string> => {
  let currentDirectory = resolve(startDirectory);

  while (true) {
    if (await isGitRoot(currentDirectory)) {
      return currentDirectory;
    }

    const parentDirectory = dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return resolve(startDirectory);
    }

    currentDirectory = parentDirectory;
  }
};

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

const validateRequestedAction = (options: ConfigCommandOptions): void => {
  const actions = [options.init, options.print, options.printTemplate].filter(Boolean);

  if (actions.length !== 1) {
    throw new Error('Choose exactly one action: --init, --print, or --print-template.');
  }

  if (options.path && options.printTemplate) {
    throw new Error('--path can only be used with --init or --print.');
  }
};

const resolvePrintPath = async (pathOption?: string): Promise<string> => {
  if (pathOption !== undefined) {
    const explicitPath = resolve(pathOption);

    if (!(await fileExists(explicitPath))) {
      throw new Error(`CloudBurn config file not found: ${explicitPath}`);
    }

    return explicitPath;
  }

  const discoveredPath = await findConfigPath(process.cwd());

  if (discoveredPath === undefined) {
    throw new Error(
      'No CloudBurn config file found. Run "cloudburn config --init" to create one or "cloudburn config --print-template" to inspect the starter template.',
    );
  }

  return discoveredPath;
};

const resolveInitPath = async (pathOption?: string): Promise<string> => {
  if (pathOption !== undefined) {
    return resolve(pathOption);
  }

  return join(await findProjectRoot(process.cwd()), '.cloudburn.yml');
};

/**
 * Registers the CloudBurn config command for printing and scaffolding config files.
 *
 * @param program - Root CLI program.
 */
export const registerConfigCommand = (program: Command): void => {
  setCommandExamples(
    program
      .command('config')
      .description('Inspect or create CloudBurn configuration')
      .option('--init', 'Create a starter CloudBurn config file')
      .option('--print', 'Print the current CloudBurn config file')
      .option('--print-template', 'Print the starter CloudBurn config template')
      .option('--path <path>', 'Use an explicit config file path with --init or --print')
      .action(async function (this: Command, options: ConfigCommandOptions) {
        try {
          validateRequestedAction(options);

          if (options.printTemplate) {
            process.stdout.write(`${renderConfigDocument(this, starterConfig)}\n`);
            process.exitCode = EXIT_CODE_OK;
            return;
          }

          if (options.print) {
            const configPath = await resolvePrintPath(options.path);
            const content = await readFile(configPath, 'utf8');

            process.stdout.write(`${renderConfigDocument(this, content)}\n`);
            process.exitCode = EXIT_CODE_OK;
            return;
          }

          const configPath = await resolveInitPath(options.path);

          if (options.path === undefined) {
            const existingConfigPath = await ensureSingleConfigFile(dirname(configPath));

            if (existingConfigPath) {
              throw new Error(
                `CloudBurn config already exists at ${existingConfigPath}. Use --print to inspect the current config.`,
              );
            }
          } else if (await fileExists(configPath)) {
            throw new Error(
              `CloudBurn config already exists at ${configPath}. Use --print to inspect the current config.`,
            );
          }

          await writeFile(configPath, starterConfig, { encoding: 'utf8', flag: 'wx' });

          const output = renderResponse(
            {
              kind: 'status',
              data: {
                message: 'Created CloudBurn config.',
                path: configPath,
              },
            },
            resolveExplicitOutputFormat(this) ?? 'table',
          );

          process.stdout.write(`${output}\n`);
          process.exitCode = EXIT_CODE_OK;
        } catch (err) {
          process.stderr.write(`${formatError(err)}\n`);
          process.exitCode = EXIT_CODE_RUNTIME_ERROR;
        }
      }),
    ['cloudburn config --init', 'cloudburn config --print', 'cloudburn config --print-template'],
  );
};
