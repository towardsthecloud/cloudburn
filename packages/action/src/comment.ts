import type { getOctokit } from '@actions/github';

export type Octokit = ReturnType<typeof getOctokit>;

/** Hidden marker appended to the sticky comment so it is matched regardless of the configured header. */
export const COMMENT_MARKER = '<!-- cloudburn-action -->';

/** GitHub rejects issue comments beyond 65,536 characters; leave headroom for the marker and notice. */
const MAX_COMMENT_BODY = 65_000;

/**
 * Creates or updates the sticky pull request comment for a scan. An existing
 * comment is matched by an invisible marker authored by the token's own
 * identity, so the action updates in place instead of stacking comments on
 * every push — even when the `header` input changes — without touching a
 * marked comment someone else posted. When the token cannot call the
 * authenticated-user endpoint (GitHub App installation tokens), matching
 * falls back to the default `github-actions[bot]` identity. Bodies beyond
 * GitHub's size limit are truncated with a pointer to the step summary.
 *
 * @param options - Octokit client, repository coordinates, and the markdown body.
 * @returns Whether a new comment was created or an existing one updated.
 */
export const upsertPullRequestComment = async (options: {
  octokit: Octokit;
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
}): Promise<'created' | 'updated'> => {
  const { octokit, owner, repo, issueNumber, body } = options;

  let actorLogin = 'github-actions[bot]';
  try {
    const { data } = await octokit.rest.users.getAuthenticated();
    actorLogin = data.login;
  } catch {
    // Installation tokens cannot call the authenticated-user endpoint.
  }
  const truncated =
    body.length > MAX_COMMENT_BODY
      ? `${body.slice(0, MAX_COMMENT_BODY)}\n\n_… Report truncated; the step summary has the complete findings table._`
      : body;
  const markedBody = `${truncated}\n\n${COMMENT_MARKER}`;

  let existing: { id: number } | undefined;
  for await (const page of octokit.paginate.iterator(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
  })) {
    existing = page.data.find(
      (comment) => comment.body?.includes(COMMENT_MARKER) && comment.user?.login === actorLogin,
    );
    if (existing !== undefined) {
      break;
    }
  }

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body: markedBody,
    });
    return 'updated';
  }

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: markedBody,
  });
  return 'created';
};
