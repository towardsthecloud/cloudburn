import type { getOctokit } from '@actions/github';

export type Octokit = ReturnType<typeof getOctokit>;

/** Hidden marker appended to the sticky comment so it is matched regardless of the configured header. */
export const COMMENT_MARKER = '<!-- cloudburn-action -->';

/**
 * Creates or updates the sticky pull request comment for a scan. An existing
 * comment is matched by an invisible marker, so the action updates in place
 * instead of stacking comments on every push — even when the `header` input
 * changes.
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
  const markedBody = `${body}\n\n${COMMENT_MARKER}`;

  let existing: { id: number } | undefined;
  for await (const page of octokit.paginate.iterator(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
  })) {
    existing = page.data.find((comment) => comment.body?.includes(COMMENT_MARKER));
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
