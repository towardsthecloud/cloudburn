import { access, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Command } from 'commander';
import { EXIT_CODE_OK, EXIT_CODE_RUNTIME_ERROR } from '../exit-codes.js';
import { formatError } from '../formatters/error.js';
import { renderResponse, resolveOutputFormat } from '../formatters/output.js';

const CONFIG_FILENAMES = ['.cloudburn.yml', '.cloudburn.yaml'] as const;

const starterConfig = `# Static IaC scan configuration.
# enabled-rules restricts scans to only the listed rule IDs.
# disabled-rules removes specific rule IDs from the active set.
# format sets the default output format when --format is not passed.
iac:
  enabled-rules:
    - CLDBRN-AWS-EBS-1
  disabled-rules:
    - CLDBRN-AWS-EC2-2
  format: table

# Live AWS discovery configuration.
# Use the same rule controls here to tune discover runs separately from IaC scans.
discovery:
  enabled-rules:
    - CLDBRN-AWS-EBS-1
  disabled-rules:
    - CLDBRN-AWS-S3-1
  format: json
`;

type InitConfigOptions = {
  print?: boolean;
};

const renderStarterConfig = (command: Command): string =>
  renderResponse(
    {
      kind: 'document',
      content: starterConfig,
      contentType: 'application/yaml',
    },
    resolveOutputFormat(command, undefined, 'text'),
  );

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const findProjectRoot = async (startDirectory: string): Promise<string> => {
  let currentDirectory = resolve(startDirectory);

  while (true) {
    if (await fileExists(join(currentDirectory, '.git'))) {
      return currentDirectory;
    }

    const parentDirectory = dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return resolve(startDirectory);
    }

    currentDirectory = parentDirectory;
  }
};

// Intent: scaffold starter config for new projects.
// TODO(cloudburn): add additional init subcommands such as GitHub Actions scaffolding.
export const registerInitCommand = (program: Command): void => {
  const initCommand = program
    .command('init')
    .description('Initialize CloudBurn scaffolding')
    .usage('[command]')
    .action(function (this: Command) {
      process.stdout.write(`${renderStarterConfig(this)}\n`);
      process.exitCode = EXIT_CODE_OK;
    });

  initCommand
    .command('config')
    .description('Create a starter .cloudburn.yml configuration')
    .option('--print', 'Print the starter config instead of writing the file')
    .action(async function (this: Command, options: InitConfigOptions) {
      try {
        if (options.print) {
          process.stdout.write(`${renderStarterConfig(this)}\n`);
          process.exitCode = EXIT_CODE_OK;
          return;
        }

        const rootDirectory = await findProjectRoot(process.cwd());
        const existingConfigPath = (
          await Promise.all(
            CONFIG_FILENAMES.map(async (filename) => {
              const path = join(rootDirectory, filename);
              return (await fileExists(path)) ? path : undefined;
            }),
          )
        ).find((path): path is string => path !== undefined);

        if (existingConfigPath) {
          throw new Error(
            `CloudBurn config already exists at ${existingConfigPath}. Use --print to inspect the template.`,
          );
        }

        const configPath = join(rootDirectory, '.cloudburn.yml');

        await writeFile(configPath, starterConfig, { encoding: 'utf8', flag: 'wx' });

        const output = renderResponse(
          {
            kind: 'status',
            data: {
              message: 'Created CloudBurn config.',
              path: configPath,
            },
            text: `Created ${configPath}.`,
          },
          resolveOutputFormat(this),
        );

        process.stdout.write(`${output}\n`);
        process.exitCode = EXIT_CODE_OK;
      } catch (err) {
        process.stderr.write(`${formatError(err)}\n`);
        process.exitCode = EXIT_CODE_RUNTIME_ERROR;
      }
    });
};
