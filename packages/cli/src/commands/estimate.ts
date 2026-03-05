import type { Command } from 'commander';

type EstimateOptions = {
  server?: string;
};

// Intent: keep an OSS-to-paid bridge command without hard dashboard coupling.
// TODO(cloudburn): call dashboard API for pricing estimates when server is provided.
export const registerEstimateCommand = (program: Command): void => {
  program
    .command('estimate')
    .description('Request optional pricing estimates from a self-hosted dashboard')
    .option('--server <url>', 'Dashboard API base URL')
    .action((options: EstimateOptions) => {
      if (!options.server) {
        process.stdout.write('No server configured. This command is optional and requires a dashboard URL.\n');
        return;
      }

      process.stdout.write(`Estimate request scaffold ready for server: ${options.server}\n`);
    });
};
