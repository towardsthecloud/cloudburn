type AsciiProgressTracker = {
  advance: () => void;
  finishError: () => void;
  finishSuccess: () => void;
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
  const isEnabled = stream.isTTY === true;
  let currentStepIndex = 0;
  let hasRendered = false;

  const render = (): void => {
    if (!isEnabled) {
      return;
    }

    const completedSteps = Math.min(currentStepIndex + 1, steps.length);
    const label = steps[Math.min(currentStepIndex, steps.length - 1)];
    stream.write(`\r[${renderBar(completedSteps, steps.length)}] ${label}`);
    hasRendered = true;
  };

  const finish = (): void => {
    if (!isEnabled || !hasRendered) {
      return;
    }

    stream.write('\n');
    hasRendered = false;
  };

  render();

  return {
    advance: () => {
      if (!isEnabled) {
        return;
      }

      currentStepIndex = Math.min(currentStepIndex + 1, steps.length - 1);
      render();
    },
    finishError: finish,
    finishSuccess: finish,
  };
};
