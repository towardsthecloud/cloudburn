const { setTimeout: delay } = require('node:timers/promises');
const changelog = require('@changesets/changelog-github').default;

const githubErrorsPrefix = 'Fetched data from GitHub returned errors\n';
const retryDelays = new Map();

// Retry GitHub's explicit internal-query failure, not authentication, permissions, or invalid queries.
function isTemporaryGithubFailure(error) {
  if (!(error instanceof Error) || !error.message.startsWith(githubErrorsPrefix)) return false;
  try {
    const errors = JSON.parse(error.message.slice(githubErrorsPrefix.length));
    return (
      Array.isArray(errors) &&
      errors.length > 0 &&
      errors.every(
        (entry) =>
          typeof entry?.message === 'string' &&
          entry.message.startsWith('Something went wrong while executing your query'),
      )
    );
  } catch {
    return false;
  }
}

function waitForRetry(attempt) {
  let pending = retryDelays.get(attempt);
  if (!pending) {
    const milliseconds = 1000 * 2 ** (attempt - 1);
    console.warn(
      `GitHub changelog lookup failed temporarily; retrying in ${milliseconds / 1000}s (attempt ${attempt + 1}/3).`,
    );
    // Release concurrent changelog callbacks together so the upstream loader can batch their retries.
    pending = delay(milliseconds).finally(() => retryDelays.delete(attempt));
    retryDelays.set(attempt, pending);
  }
  return pending;
}

async function retry(generate, args) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await generate(...args);
    } catch (error) {
      if (attempt === 3 || !isTemporaryGithubFailure(error)) throw error;
      await waitForRetry(attempt);
    }
  }
}

/**
 * Changesets changelog adapter retaining upstream formatting with bounded retries for GitHub internal errors.
 * Both callbacks accept the upstream changeset/dependency arguments and options and return the generated Markdown.
 */
module.exports = {
  getReleaseLine: (...args) => retry(changelog.getReleaseLine, args),
  getDependencyReleaseLine: (...args) => retry(changelog.getDependencyReleaseLine, args),
};
