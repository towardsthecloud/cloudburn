type TerraformHeredoc = {
  allowIndent: boolean;
  delimiter: string;
};

/** Mutable lexical state shared across consecutive Terraform source lines. */
export type TerraformLexerState = {
  heredoc?: TerraformHeredoc;
  inBlockComment: boolean;
};

/** One Terraform comment segment with its one-based source column. */
export type TerraformCommentSegment = {
  column: number;
  text: string;
};

/**
 * Creates the initial state for scanning one Terraform source file or block.
 *
 * @returns Mutable lexer state ready for the first source line.
 */
export const createTerraformLexerState = (): TerraformLexerState => ({ inBlockComment: false });

const isHeredocEnd = (line: string, heredoc: TerraformHeredoc): boolean => {
  const candidate = heredoc.allowIndent ? line.trimStart() : line;
  return candidate.trimEnd() === heredoc.delimiter;
};

/**
 * Scans one Terraform line for structural braces and comment segments.
 *
 * @param line - Raw Terraform source line.
 * @param state - Mutable lexical state carried between consecutive lines.
 * @returns Brace delta, comments, and whether the line began inside literal/comment content.
 */
export const scanTerraformLine = (
  line: string,
  state: TerraformLexerState,
): { braceDelta: number; comments: TerraformCommentSegment[]; isLiteralLine: boolean } => {
  const isLiteralLine = state.heredoc !== undefined || state.inBlockComment;

  if (state.heredoc) {
    if (isHeredocEnd(line, state.heredoc)) {
      state.heredoc = undefined;
    }
    return { braceDelta: 0, comments: [], isLiteralLine };
  }

  const comments: TerraformCommentSegment[] = [];
  let braceDelta = 0;
  let quote: '"' | "'" | undefined;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (state.inBlockComment) {
      const endIndex = line.indexOf('*/', index);
      comments.push({
        column: index + 1,
        text: line.slice(index, endIndex === -1 ? undefined : endIndex),
      });
      if (endIndex === -1) {
        break;
      }
      state.inBlockComment = false;
      index = endIndex + 1;
      continue;
    }

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

    if (character === '#' || (character === '/' && nextCharacter === '/')) {
      const markerWidth = character === '#' ? 1 : 2;
      comments.push({ column: index + 1, text: line.slice(index + markerWidth) });
      break;
    }

    if (character === '/' && nextCharacter === '*') {
      const endIndex = line.indexOf('*/', index + 2);
      comments.push({
        column: index + 1,
        text: line.slice(index + 2, endIndex === -1 ? undefined : endIndex),
      });
      if (endIndex === -1) {
        state.inBlockComment = true;
        break;
      }
      index = endIndex + 1;
      continue;
    }

    if (character === '<' && nextCharacter === '<') {
      const heredocMatch = /^<<(-?)([A-Za-z_][A-Za-z0-9_-]*)\s*$/u.exec(line.slice(index));
      if (heredocMatch?.[2]) {
        state.heredoc = {
          allowIndent: heredocMatch[1] === '-',
          delimiter: heredocMatch[2],
        };
        break;
      }
    }

    if (character === '{') {
      braceDelta += 1;
    } else if (character === '}') {
      braceDelta -= 1;
    }
  }

  return { braceDelta, comments, isLiteralLine };
};
