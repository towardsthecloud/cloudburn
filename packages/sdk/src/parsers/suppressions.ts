import type { IaCSuppression, SourceLocation } from '@cloudburn/rules';
import { createTerraformLexerState, scanTerraformLine } from './terraform-lexer.js';

type CommentSyntax = 'terraform' | 'yaml';

type SuppressionComment = {
  line: number;
  suppression: IaCSuppression;
};

type YamlQuoteState = {
  quote?: '"' | "'";
};

const YAML_NODE_PROPERTY_PREFIX = /^(?:-\s+)?(?:(?:![^\s]+|&[^\s]+)\s*)*$/u;

const parseSuppression = (text: string, location: SourceLocation): IaCSuppression | undefined => {
  const normalized = text.replace(/\*\/\s*$/u, '').trim();
  const ignoreAllMatch = /(?:^|\s)cloudburn-ignore-all(?:\s+(.+))?$/u.exec(normalized);

  if (ignoreAllMatch) {
    const reason = ignoreAllMatch[1]?.trim();
    return {
      kind: 'all',
      location,
      ...(reason ? { reason } : {}),
    };
  }

  const ignoreRuleMatch = /(?:^|\s)cloudburn-ignore\s+(\S+)(?:\s+(.+))?$/u.exec(normalized);

  if (!ignoreRuleMatch?.[1]) {
    return undefined;
  }

  const reason = ignoreRuleMatch[2]?.trim();
  return {
    kind: 'rule',
    location,
    ruleId: ignoreRuleMatch[1],
    ...(reason ? { reason } : {}),
  };
};

const findYamlLineCommentStart = (line: string, state: YamlQuoteState): number | undefined => {
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (state.quote === '"') {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        state.quote = undefined;
      }
      continue;
    }

    if (state.quote === "'") {
      if (character === "'" && line[index + 1] === "'") {
        index += 1;
      } else if (character === "'") {
        state.quote = undefined;
      }
      continue;
    }

    if ((character === '"' || character === "'") && isYamlQuotedScalarStart(line, index)) {
      state.quote = character;
      continue;
    }

    const previous = line[index - 1];
    if (character === '#' && (index === 0 || /\s/u.test(previous ?? ''))) {
      return index;
    }
  }

  return undefined;
};

function isYamlQuotedScalarStart(line: string, quoteIndex: number): boolean {
  const prefix = line.slice(0, quoteIndex);
  const previousCharacter = prefix.at(-1);

  if (previousCharacter !== undefined && !/\s/u.test(previousCharacter)) {
    return ':,[{?'.includes(previousCharacter);
  }

  const trimmedPrefix = prefix.trimEnd();
  const boundaryIndex = Math.max(
    trimmedPrefix.lastIndexOf(':'),
    trimmedPrefix.lastIndexOf(','),
    trimmedPrefix.lastIndexOf('['),
    trimmedPrefix.lastIndexOf('{'),
    trimmedPrefix.lastIndexOf('?'),
  );
  const nodePrefix = trimmedPrefix.slice(boundaryIndex + 1).trimStart();

  return YAML_NODE_PROPERTY_PREFIX.test(nodePrefix);
}

const toYamlCommentSegments = (line: string, state: YamlQuoteState) => {
  const commentStart = findYamlLineCommentStart(line, state);

  return commentStart === undefined ? [] : [{ column: commentStart + 1, text: line.slice(commentStart + 1) }];
};

/** Extracts supported inline suppression directives from IaC source comments. */
export const extractSuppressionComments = (
  contents: string,
  path: string,
  syntax: CommentSyntax,
  excludedLines: ReadonlySet<number> = new Set(),
): SuppressionComment[] => {
  const comments: SuppressionComment[] = [];
  const lines = contents.split(/\r?\n/u);
  const terraformState = createTerraformLexerState();
  const yamlQuoteState: YamlQuoteState = {};

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';
    const lineNumber = lineIndex + 1;

    if (excludedLines.has(lineNumber)) {
      continue;
    }

    const segments =
      syntax === 'terraform'
        ? scanTerraformLine(line, terraformState).comments
        : toYamlCommentSegments(line, yamlQuoteState);

    for (const segment of segments) {
      const location = { column: segment.column, line: lineNumber, path };
      const suppression = parseSuppression(segment.text, location);
      if (suppression) {
        comments.push({ line: lineNumber, suppression });
      }
    }
  }

  return comments;
};

/** Returns directives directly above or anywhere inside one resource declaration. */
export const findResourceSuppressions = (
  comments: SuppressionComment[],
  startLine: number,
  endLine: number,
): IaCSuppression[] =>
  comments
    .filter(({ line }) => line === startLine - 1 || (line >= startLine && line <= endLine))
    .map(({ suppression }) => suppression);
