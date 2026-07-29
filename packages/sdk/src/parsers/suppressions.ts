import type { IaCSuppression, SourceLocation } from '@cloudburn/rules';

type CommentSyntax = 'terraform' | 'yaml';

type SuppressionComment = {
  line: number;
  suppression: IaCSuppression;
};

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

const findLineCommentStart = (line: string, syntax: CommentSyntax): number | undefined => {
  let quote: '"' | "'" | undefined;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\' && quote === '"') {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    const previous = line[index - 1];
    if (character === '#' && (index === 0 || /\s/u.test(previous ?? ''))) {
      return index;
    }

    if (syntax === 'terraform' && character === '/' && line[index + 1] === '/') {
      return index;
    }
  }

  return undefined;
};

/** Extracts supported inline suppression directives from IaC source comments. */
export const extractSuppressionComments = (
  contents: string,
  path: string,
  syntax: CommentSyntax,
): SuppressionComment[] => {
  const comments: SuppressionComment[] = [];
  const lines = contents.split(/\r?\n/u);
  let inBlockComment = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';
    const segments: Array<{ column: number; text: string }> = [];

    if (syntax === 'terraform') {
      let searchIndex = 0;
      while (searchIndex < line.length) {
        if (inBlockComment) {
          const endIndex = line.indexOf('*/', searchIndex);
          segments.push({
            column: searchIndex + 1,
            text: line.slice(searchIndex, endIndex === -1 ? undefined : endIndex),
          });
          if (endIndex === -1) {
            searchIndex = line.length;
          } else {
            inBlockComment = false;
            searchIndex = endIndex + 2;
          }
          continue;
        }

        const blockStart = line.indexOf('/*', searchIndex);
        const lineCommentStart = findLineCommentStart(line.slice(searchIndex), syntax);
        const absoluteLineCommentStart = lineCommentStart === undefined ? undefined : searchIndex + lineCommentStart;

        if (blockStart !== -1 && (absoluteLineCommentStart === undefined || blockStart < absoluteLineCommentStart)) {
          const endIndex = line.indexOf('*/', blockStart + 2);
          segments.push({
            column: blockStart + 1,
            text: line.slice(blockStart + 2, endIndex === -1 ? undefined : endIndex),
          });
          inBlockComment = endIndex === -1;
          searchIndex = endIndex === -1 ? line.length : endIndex + 2;
          continue;
        }

        if (absoluteLineCommentStart !== undefined) {
          const markerWidth = line.startsWith('//', absoluteLineCommentStart) ? 2 : 1;
          segments.push({
            column: absoluteLineCommentStart + 1,
            text: line.slice(absoluteLineCommentStart + markerWidth),
          });
        }
        break;
      }
    } else {
      const commentStart = findLineCommentStart(line, syntax);
      if (commentStart !== undefined) {
        segments.push({ column: commentStart + 1, text: line.slice(commentStart + 1) });
      }
    }

    for (const segment of segments) {
      const location = { column: segment.column, line: lineIndex + 1, path };
      const suppression = parseSuppression(segment.text, location);
      if (suppression) {
        comments.push({ line: lineIndex + 1, suppression });
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
