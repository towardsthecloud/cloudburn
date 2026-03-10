import type { ScanResult } from '@cloudburn/sdk';
import { type Command, InvalidArgumentError } from 'commander';
import { flattenScanResult } from './shared.js';

/** Supported stdout formats for CloudBurn CLI responses. */
export type OutputFormat = 'text' | 'json' | 'table';

type Primitive = boolean | number | string | null | undefined;
type CellValue = Primitive | Primitive[] | Record<string, unknown>;

type ColumnSpec = {
  key: string;
  header: string;
};

type RecordRow = Record<string, CellValue>;

/** Structured stdout payload emitted by CloudBurn commands. */
export type CliResponse =
  | {
      kind: 'document';
      content: string;
      contentType: string;
    }
  | {
      kind: 'record-list';
      columns?: ColumnSpec[];
      emptyMessage: string;
      rows: RecordRow[];
    }
  | {
      kind: 'scan-result';
      result: ScanResult;
    }
  | {
      kind: 'status';
      data: RecordRow;
      text: string;
    }
  | {
      kind: 'string-list';
      columnHeader: string;
      emptyMessage: string;
      values: string[];
    };

const supportedOutputFormats: readonly OutputFormat[] = ['text', 'json', 'table'] as const;

const scanColumns: ColumnSpec[] = [
  { key: 'provider', header: 'Provider' },
  { key: 'ruleId', header: 'RuleId' },
  { key: 'source', header: 'Source' },
  { key: 'service', header: 'Service' },
  { key: 'resourceId', header: 'ResourceId' },
  { key: 'accountId', header: 'AccountId' },
  { key: 'region', header: 'Region' },
  { key: 'path', header: 'Path' },
  { key: 'startLine', header: 'StartLine' },
  { key: 'startColumn', header: 'StartColumn' },
  { key: 'message', header: 'Message' },
];

const formatOptionDescription =
  'Output format. table: human-readable terminal output. text: tab-delimited output for grep, sed, and awk. json: machine-readable output for automation and downstream systems.';

/** Shared `--format` help text used across root and compatibility aliases. */
export const OUTPUT_FORMAT_OPTION_DESCRIPTION = formatOptionDescription;

/** Parses a user-provided CLI output format. */
export const parseOutputFormat = (value: string): OutputFormat => {
  if (supportedOutputFormats.includes(value as OutputFormat)) {
    return value as OutputFormat;
  }

  throw new InvalidArgumentError(`Invalid format "${value}". Allowed formats: ${supportedOutputFormats.join(', ')}.`);
};

/** Resolves the effective output format for a command invocation. */
export const resolveOutputFormat = (
  command: Command,
  localFormat?: OutputFormat,
  defaultFormat: OutputFormat = 'table',
): OutputFormat => {
  if (localFormat) {
    return localFormat;
  }

  const options = typeof command.optsWithGlobals === 'function' ? command.optsWithGlobals() : command.opts();
  return (options.format as OutputFormat | undefined) ?? defaultFormat;
};

/** Renders a typed CLI response using the selected stdout format. */
export const renderResponse = (response: CliResponse, format: OutputFormat): string => {
  switch (format) {
    case 'json':
      return renderJson(response);
    case 'text':
      return renderText(response);
    case 'table':
      return renderTable(response);
  }
};

const renderJson = (response: CliResponse): string => {
  switch (response.kind) {
    case 'document':
      return JSON.stringify({ content: response.content, contentType: response.contentType }, null, 2);
    case 'record-list':
      return JSON.stringify(response.rows, null, 2);
    case 'scan-result':
      return JSON.stringify(response.result, null, 2);
    case 'status':
      return JSON.stringify(response.data, null, 2);
    case 'string-list':
      return JSON.stringify(response.values, null, 2);
  }
};

const renderText = (response: CliResponse): string => {
  switch (response.kind) {
    case 'document':
      return response.content;
    case 'record-list':
      return renderTextRows(response.rows, response.columns, response.emptyMessage);
    case 'scan-result':
      return renderTextRows(projectScanRows(response.result), scanColumns, 'No findings.');
    case 'status':
      return response.text;
    case 'string-list':
      return response.values.length === 0 ? response.emptyMessage : response.values.join('\n');
  }
};

const renderTable = (response: CliResponse): string => {
  switch (response.kind) {
    case 'document':
      return renderAsciiTable(
        [
          { Field: 'ContentType', Value: response.contentType },
          { Field: 'Content', Value: response.content },
        ],
        [
          { key: 'Field', header: 'Field' },
          { key: 'Value', header: 'Value' },
        ],
      );
    case 'record-list':
      return response.rows.length === 0
        ? response.emptyMessage
        : renderAsciiTable(response.rows, response.columns ?? inferColumns(response.rows));
    case 'scan-result': {
      const rows = projectScanRows(response.result);
      return rows.length === 0 ? 'No findings.' : renderAsciiTable(rows, scanColumns);
    }
    case 'status':
      return renderAsciiTable(
        Object.entries(response.data).map(([field, value]) => ({ Field: field, Value: value })),
        [
          { key: 'Field', header: 'Field' },
          { key: 'Value', header: 'Value' },
        ],
      );
    case 'string-list':
      return response.values.length === 0
        ? response.emptyMessage
        : renderAsciiTable(
            response.values.map((value) => ({ [response.columnHeader]: value })),
            [{ key: response.columnHeader, header: response.columnHeader }],
          );
  }
};

const projectScanRows = (result: ScanResult): RecordRow[] =>
  flattenScanResult(result).map(({ finding, message, provider, ruleId, service, source }) => ({
    accountId: finding.accountId ?? '',
    message,
    path: finding.location?.path ?? '',
    provider,
    region: finding.region ?? '',
    resourceId: finding.resourceId,
    ruleId,
    service,
    source,
    startColumn: finding.location?.startColumn ?? '',
    startLine: finding.location?.startLine ?? '',
  }));

const renderTextRows = (rows: RecordRow[], columns: ColumnSpec[] | undefined, emptyMessage: string): string => {
  if (rows.length === 0) {
    return emptyMessage;
  }

  const resolvedColumns = columns ?? inferColumns(rows);

  return rows.map((row) => resolvedColumns.map((column) => toTextCell(row[column.key])).join('\t')).join('\n');
};

const inferColumns = (rows: RecordRow[]): ColumnSpec[] => {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).sort((left, right) =>
    left.localeCompare(right),
  );
  return keys.map((key) => ({ key, header: key }));
};

const toTextCell = (value: CellValue): string => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
};

const toTableCell = (value: CellValue): string => toTextCell(value).replace(/\r?\n/g, '\\n');

const renderAsciiTable = (rows: RecordRow[], columns: ColumnSpec[]): string => {
  const widths = columns.map((column) =>
    Math.max(column.header.length, ...rows.map((row) => toTableCell(row[column.key]).length)),
  );

  const border = `+${widths.map((width) => '-'.repeat(width + 2)).join('+')}+`;
  const header = `| ${columns.map((column, index) => column.header.padEnd(widths[index] ?? 0)).join(' | ')} |`;
  const body = rows.map(
    (row) =>
      `| ${columns.map((column, index) => toTableCell(row[column.key]).padEnd(widths[index] ?? 0)).join(' | ')} |`,
  );

  return [border, header, border, ...body, border].join('\n');
};
