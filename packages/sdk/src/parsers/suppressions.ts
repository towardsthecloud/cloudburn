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

const YAML_FLOW_BOUNDARY_CHARACTERS = ':,[{?';

/**
 * Tracks, in one left-to-right pass, whether the text since the last flow boundary
 * consists only of node properties (`!tag`, `&anchor`), optionally preceded by
 * block sequence indicators (`-`) when no boundary has been seen on the line yet.
 */
type YamlNodePrefixState = {
  dashAllowed: boolean;
  propertySeen: boolean;
  token: 'none' | 'dash' | 'property' | 'invalid';
  valid: boolean;
};

const createYamlNodePrefixState = (dashAllowed: boolean): YamlNodePrefixState => ({
  dashAllowed,
  propertySeen: false,
  token: 'none',
  valid: true,
});

const isWhitespace = (character: string | undefined): boolean => character !== undefined && /\s/u.test(character);

const advanceYamlNodePrefix = (state: YamlNodePrefixState, character: string): void => {
  if (YAML_FLOW_BOUNDARY_CHARACTERS.includes(character)) {
    Object.assign(state, createYamlNodePrefixState(false));
    return;
  }

  if (isWhitespace(character)) {
    state.token = 'none';
    return;
  }

  if (!state.valid) {
    return;
  }

  if (state.token === 'none') {
    if (character === '!' || character === '&') {
      state.token = 'property';
      state.propertySeen = true;
    } else if (character === '-' && state.dashAllowed && !state.propertySeen) {
      state.token = 'dash';
    } else {
      state.valid = false;
    }
  } else if (state.token === 'dash') {
    state.valid = false;
  }
};

const parseSuppression = (text: string, location: SourceLocation): IaCSuppression | undefined => {
  const normalized = text.replace(/\*\/\s*$/u, '').trim();
  const ignoreAllMatch = /(?:^|\s)cloudburn-ignore-all(?:\s([\s\S]*))?$/u.exec(normalized);

  if (ignoreAllMatch) {
    const reason = ignoreAllMatch[1]?.trim();
    return {
      kind: 'all',
      location,
      ...(reason ? { reason } : {}),
    };
  }

  const ignoreRuleMatch = /(?:^|\s)cloudburn-ignore\s+(\S+)(?:\s([\s\S]*))?$/u.exec(normalized);

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
  const nodePrefix = createYamlNodePrefixState(true);
  let escaped = false;
  let advancedTo = 0;

  for (let index = 0; index < line.length; index += 1) {
    for (; advancedTo < index; advancedTo += 1) {
      advanceYamlNodePrefix(nodePrefix, line[advancedTo] ?? '');
    }

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

    const previous = line[index - 1];

    if ((character === '"' || character === "'") && isYamlQuotedScalarStart(previous, nodePrefix)) {
      state.quote = character;
      continue;
    }

    if (character === '#' && (previous === undefined || isWhitespace(previous))) {
      return index;
    }
  }

  return undefined;
};

const isYamlQuotedScalarStart = (previousCharacter: string | undefined, nodePrefix: YamlNodePrefixState): boolean =>
  previousCharacter === undefined || isWhitespace(previousCharacter)
    ? nodePrefix.valid
    : YAML_FLOW_BOUNDARY_CHARACTERS.includes(previousCharacter);

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
