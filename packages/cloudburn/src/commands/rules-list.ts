import { builtInRuleMetadata, type Source } from '@cloudburn/sdk';
import { type Command, InvalidArgumentError } from 'commander';
import { renderResponse, resolveOutputFormat } from '../formatters/output.js';
import { registerParentCommand } from '../help.js';
import { parseServiceList, parseSourceList } from './config-options.js';

type RulesListOptions = {
  service?: string[];
  source?: Source[];
};

const VALID_SOURCES = ['discovery', 'iac'] as const;

const validateSelectedValues = <TValue extends string>(
  values: TValue[],
  validValues: Set<string>,
  label: string,
): TValue[] => {
  const invalidValue = values.find((value) => !validValues.has(value));

  if (invalidValue !== undefined) {
    throw new InvalidArgumentError(
      `Unknown ${label} "${invalidValue}". Allowed ${label}s: ${Array.from(validValues).sort().join(', ')}.`,
    );
  }

  return values;
};

const parseRulesListServiceList = (value: string): string[] =>
  validateSelectedValues(parseServiceList(value), new Set(builtInRuleMetadata.map((rule) => rule.service)), 'service');

const parseRulesListSourceList = (value: string): Source[] =>
  validateSelectedValues(parseSourceList(value), new Set(VALID_SOURCES), 'source');

const filterRules = (options: RulesListOptions) => {
  return builtInRuleMetadata.filter((rule) => {
    if (options.service !== undefined && !options.service.includes(rule.service)) {
      return false;
    }

    if (options.source !== undefined && !options.source.some((source) => rule.supports.includes(source))) {
      return false;
    }

    return true;
  });
};

// Intent: expose built-in rules so users can inspect shipped policy metadata.
// TODO(cloudburn): include configured custom rule discovery when the SDK registry supports it.
export const registerRulesListCommand = (program: Command): void => {
  const rulesCommand = registerParentCommand(program, 'rules', 'Inspect built-in CloudBurn rules');

  rulesCommand
    .command('list')
    .description('List built-in CloudBurn rules')
    .option('--service <services>', 'Comma-separated services to include.', parseRulesListServiceList)
    .option('--source <sources>', 'Comma-separated sources to include (`iac`, `discovery`).', parseRulesListSourceList)
    .action(function (this: Command, options: RulesListOptions) {
      const output = renderResponse(
        {
          kind: 'rule-list',
          emptyMessage: 'No built-in rules are available.',
          rules: filterRules(options),
        },
        resolveOutputFormat(this, undefined, 'table'),
      );

      process.stdout.write(`${output}\n`);
    });
};
