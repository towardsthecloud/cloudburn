import type { Command } from 'commander';

const starterConfig = `version: 1
profile: dev

# Profiles are parsed but not applied yet, so configure the active rules block directly for now.
rules:
  ec2-instance-type-preferred:
    severity: error
`;

// Intent: scaffold starter config for new projects.
// TODO(cloudburn): write .cloudburn.yml to disk with overwrite safeguards.
export const registerInitCommand = (program: Command): void => {
  program
    .command('init')
    .description('Print a starter .cloudburn.yml configuration')
    .action(() => {
      process.stdout.write(`${starterConfig}\n`);
    });
};
