import { filterBuiltInRules, type Severity, type Source } from '@cloudburn/sdk';
import { type Command, InvalidArgumentError } from 'commander';
import { renderResponse, resolveOutputFormat } from '../formatters/output.js';
import { registerParentCommand } from '../help.js';
import { parseServiceList, parseSeverity, parseSourceList } from './config-options.js';

type RulesListOptions = {
  service?: string[];
  severity?: Severity;
  source?: Source[];
};

const VALID_SOURCES: Source[] = ['discovery', 'iac'];

const parseRulesListSourceList = (value: string): Source[] => {
  const sources = parseSourceList(value);
  const invalidSource = sources.find((source) => !VALID_SOURCES.includes(source));

  if (invalidSource !== undefined) {
    throw new InvalidArgumentError(`Unknown source "${invalidSource}". Allowed sources: ${VALID_SOURCES.join(', ')}.`);
  }

  return sources;
};

// Intent: expose built-in rules so users can inspect shipped policy metadata.
// TODO(cloudburn): include configured custom rule discovery when the SDK registry supports it.
export const registerRulesListCommand = (program: Command): void => {
  const rulesCommand = registerParentCommand(program, 'rules', 'Inspect built-in CloudBurn rules');

  rulesCommand
    .command('list')
    .description('List built-in CloudBurn rules')
    .option('--service <services>', 'Comma-separated services to include.', parseServiceList())
    .option('--severity <severity>', 'Severity to include (`high`, `medium`, `low`).', parseSeverity)
    .option('--source <sources>', 'Comma-separated sources to include (`iac`, `discovery`).', parseRulesListSourceList)
    .action(function (this: Command, options: RulesListOptions) {
      const output = renderResponse(
        {
          kind: 'rule-list',
          emptyMessage: 'No built-in rules are available.',
          rules: filterBuiltInRules({ services: options.service, severity: options.severity, sources: options.source }),
        },
        resolveOutputFormat(this, undefined, 'table'),
      );

      process.stdout.write(`${output}\n`);
    });
};
