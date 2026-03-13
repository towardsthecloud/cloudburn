import type { BuiltInRuleMetadata, ScanResult } from '@cloudburn/sdk';
import { type Command, InvalidArgumentError } from 'commander';
import { flattenScanResult, getScanDiagnostics } from './shared.js';

/** Supported stdout formats for CloudBurn CLI responses. */
export type OutputFormat = 'text' | 'json' | 'table';

type Primitive = boolean | number | string | null | undefined;
type CellValue = Primitive | Primitive[] | Record<string, unknown>;

type ColumnSpec = {
  key: string;
  header: string;
};

type RecordRow = Record<string, CellValue>;

const DEFAULT_TABLE_WIDTH = 200;
const MIN_COLUMN_WIDTH = 4;
const PREFERRED_MIN_COLUMN_WIDTH = 8;

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
      kind: 'discovery-status';
      columns?: ColumnSpec[];
      rows: RecordRow[];
      summary: RecordRow;
      summaryText: string;
    }
  | {
      kind: 'scan-result';
      result: ScanResult;
    }
  | {
      kind: 'rule-list';
      emptyMessage: string;
      rules: BuiltInRuleMetadata[];
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
  { key: 'line', header: 'Line' },
  { key: 'column', header: 'Column' },
  { key: 'message', header: 'Message' },
];

const formatOptionDescription =
  'Options: table: human-readable terminal output.\ntext: tab-delimited output for grep, sed, and awk.\njson: machine-readable output for automation and downstream systems.';

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
    case 'discovery-status':
      return JSON.stringify({ summary: response.summary, regions: response.rows }, null, 2);
    case 'record-list':
      return JSON.stringify(response.rows, null, 2);
    case 'rule-list':
      return JSON.stringify(response.rules, null, 2);
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
    case 'discovery-status':
      return `${response.summaryText}\n${renderTextRows(response.rows, response.columns, 'No discovery status available.')}`;
    case 'record-list':
      return renderTextRows(response.rows, response.columns, response.emptyMessage);
    case 'rule-list':
      return renderRuleList(response.rules, response.emptyMessage);
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
    case 'discovery-status': {
      const summaryTable = renderAsciiTable(
        Object.entries(response.summary).map(([field, value]) => ({ Field: field, Value: value })),
        [
          { key: 'Field', header: 'Field' },
          { key: 'Value', header: 'Value' },
        ],
      );
      const regionsTable =
        response.rows.length === 0
          ? 'No discovery status available.'
          : renderAsciiTable(response.rows, response.columns ?? inferColumns(response.rows));

      return `${summaryTable}\n\n${regionsTable}`;
    }
    case 'record-list':
      return response.rows.length === 0
        ? response.emptyMessage
        : renderAsciiTable(response.rows, response.columns ?? inferColumns(response.rows));
    case 'rule-list':
      return renderRuleList(response.rules, response.emptyMessage);
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

const projectScanRows = (result: ScanResult): RecordRow[] => [
  ...flattenScanResult(result).map(({ finding, message, provider, ruleId, service, source }) => ({
    accountId: finding.accountId ?? '',
    message,
    path: finding.location?.path ?? '',
    provider,
    region: finding.region ?? '',
    resourceId: finding.resourceId,
    ruleId,
    service,
    source,
    column: finding.location?.column ?? '',
    line: finding.location?.line ?? '',
  })),
  ...getScanDiagnostics(result).map((diagnostic) => ({
    accountId: '',
    column: '',
    line: '',
    message: diagnostic.message,
    path: '',
    provider: diagnostic.provider,
    region: diagnostic.region ?? '',
    resourceId: '',
    ruleId: '',
    service: diagnostic.service,
    source: diagnostic.source,
  })),
];

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

const renderRuleList = (rules: BuiltInRuleMetadata[], emptyMessage: string): string => {
  if (rules.length === 0) {
    return emptyMessage;
  }

  let currentProvider = '';
  let currentService = '';
  const lines: string[] = [];

  for (const rule of rules) {
    if (rule.provider !== currentProvider) {
      currentProvider = rule.provider;
      currentService = '';
      lines.push(rule.provider);
    }

    if (rule.service !== currentService) {
      currentService = rule.service;
      lines.push(`  ${rule.service}`);
    }

    lines.push(`    ${rule.id}: ${rule.description}`);
  }

  return lines.join('\n');
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

const toTableCell = (value: CellValue): string => {
  if (Array.isArray(value)) {
    return value
      .map((item) => toTextCell(item))
      .join(', ')
      .replace(/\r?\n/g, '\\n');
  }

  return toTextCell(value).replace(/\r?\n/g, '\\n');
};

const resolveTableColumns = (rows: RecordRow[], columns: ColumnSpec[]): ColumnSpec[] => {
  const visibleColumns = columns.filter((column) => rows.some((row) => toTableCell(row[column.key]).length > 0));
  return visibleColumns.length === 0 ? columns : visibleColumns;
};

const getTargetTableWidth = (): number => {
  const terminalWidth = process.stdout.columns;
  return typeof terminalWidth === 'number' && Number.isFinite(terminalWidth) && terminalWidth > 0
    ? terminalWidth
    : DEFAULT_TABLE_WIDTH;
};

const measureTableWidth = (widths: number[]): number =>
  widths.reduce((total, width) => total + width, 0) + widths.length * 3 + 1;

const fitColumnWidths = (columns: ColumnSpec[], rows: RecordRow[]): number[] => {
  const maxWidths = columns.map((column) =>
    Math.max(column.header.length, ...rows.map((row) => toTableCell(row[column.key]).length)),
  );
  const minWidths = columns.map((column, index) =>
    Math.min(
      maxWidths[index] ?? MIN_COLUMN_WIDTH,
      Math.max(MIN_COLUMN_WIDTH, Math.min(column.header.length, PREFERRED_MIN_COLUMN_WIDTH)),
    ),
  );
  const widths = [...maxWidths];
  const targetWidth = getTargetTableWidth();

  while (measureTableWidth(widths) > targetWidth) {
    let widestColumnIndex = -1;

    for (let index = 0; index < widths.length; index += 1) {
      if ((widths[index] ?? 0) <= (minWidths[index] ?? MIN_COLUMN_WIDTH)) {
        continue;
      }

      if (widestColumnIndex === -1 || (widths[index] ?? 0) > (widths[widestColumnIndex] ?? 0)) {
        widestColumnIndex = index;
      }
    }

    if (widestColumnIndex === -1) {
      break;
    }

    widths[widestColumnIndex] = Math.max(MIN_COLUMN_WIDTH, (widths[widestColumnIndex] ?? MIN_COLUMN_WIDTH) - 1);
  }

  return widths;
};

const wrapToken = (token: string, width: number): string[] => {
  if (token.length <= width) {
    return [token];
  }

  const segments: string[] = [];

  for (let start = 0; start < token.length; start += width) {
    segments.push(token.slice(start, start + width));
  }

  return segments;
};

const wrapCell = (value: string, width: number): string[] => {
  if (value.length <= width) {
    return [value];
  }

  const words = value.split(/\s+/).filter((word) => word.length > 0);

  if (words.length === 0) {
    return [''];
  }

  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (word.length > width) {
      if (currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = '';
      }

      lines.push(...wrapToken(word, width));
      continue;
    }

    if (currentLine.length === 0) {
      currentLine = word;
      continue;
    }

    if (currentLine.length + 1 + word.length <= width) {
      currentLine = `${currentLine} ${word}`;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
};

const renderTableLines = (cells: string[], widths: number[]): string[] => {
  const wrappedCells = cells.map((cell, index) => wrapCell(cell, widths[index] ?? MIN_COLUMN_WIDTH));
  const height = Math.max(...wrappedCells.map((lines) => lines.length));

  return Array.from({ length: height }, (_, lineIndex) => {
    const line = wrappedCells
      .map((lines, index) => (lines[lineIndex] ?? '').padEnd(widths[index] ?? MIN_COLUMN_WIDTH))
      .join(' | ');

    return `| ${line} |`;
  });
};

const renderAsciiTable = (rows: RecordRow[], columns: ColumnSpec[]): string => {
  const visibleColumns = resolveTableColumns(rows, columns);
  const widths = fitColumnWidths(visibleColumns, rows);
  const border = `+${widths.map((width) => '-'.repeat(width + 2)).join('+')}+`;
  const header = renderTableLines(
    visibleColumns.map((column) => column.header),
    widths,
  );
  const body = rows.flatMap((row) =>
    renderTableLines(
      visibleColumns.map((column) => toTableCell(row[column.key])),
      widths,
    ),
  );

  return [border, ...header, border, ...body, border].join('\n');
};
