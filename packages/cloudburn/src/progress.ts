type AsciiProgressTracker = {
  advance: (nextLabel?: string) => void;
  finishError: () => void;
  finishSuccess: () => void;
  setLabel: (label: string) => void;
};

const PROGRESS_BAR_WIDTH = 10;

const renderBar = (completedSteps: number, totalSteps: number): string => {
  const filledWidth = Math.max(1, Math.round((completedSteps / totalSteps) * PROGRESS_BAR_WIDTH));

  return `${'#'.repeat(filledWidth)}${'-'.repeat(PROGRESS_BAR_WIDTH - filledWidth)}`;
};

/**
 * Creates a lightweight ASCII progress tracker for interactive CLI commands.
 *
 * The tracker writes transient updates to `stderr` only when the target stream
 * is attached to a TTY, keeping structured `stdout` output unchanged.
 *
 * @param steps - Ordered progress labels to render.
 * @param stream - Writable TTY stream used for progress output.
 * @returns Progress controls for advancing and finalizing the display.
 */
export const createAsciiProgressTracker = (
  steps: readonly [string, ...string[]],
  stream: NodeJS.WriteStream = process.stderr,
): AsciiProgressTracker => {
  const [firstStep, ...remainingSteps] = steps;
  const isEnabled = stream.isTTY === true;
  const lastStep = remainingSteps.at(-1) ?? firstStep;
  let currentStepIndex = 0;
  let currentLabel = firstStep;
  let hasRendered = false;
  let previousLineLength = 0;

  const render = (): void => {
    if (!isEnabled) {
      return;
    }

    const completedSteps = Math.min(currentStepIndex + 1, steps.length);
    const line = `[${renderBar(completedSteps, steps.length)}] ${currentLabel}`;
    const padding = previousLineLength > line.length ? ' '.repeat(previousLineLength - line.length) : '';

    stream.write(`\r${line}${padding}`);
    hasRendered = true;
    previousLineLength = line.length;
  };

  const finish = (): void => {
    if (!isEnabled || !hasRendered) {
      return;
    }

    stream.write('\n');
    hasRendered = false;
    previousLineLength = 0;
  };

  render();

  return {
    advance: (nextLabel) => {
      if (!isEnabled) {
        return;
      }

      currentStepIndex = Math.min(currentStepIndex + 1, steps.length - 1);
      currentLabel = nextLabel ?? steps[currentStepIndex] ?? lastStep;
      render();
    },
    finishError: finish,
    finishSuccess: finish,
    setLabel: (label) => {
      if (!isEnabled) {
        return;
      }

      currentLabel = label;
      render();
    },
  };
};
