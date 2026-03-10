import type { Command } from 'commander';

const starterConfig = `version: 1
profile: dev

profiles:
  dev:
    ec2-allowed-instance-types:
      allow: [t3.micro, t3.small, t3.medium]

rules:
  ec2-allowed-instance-types:
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
