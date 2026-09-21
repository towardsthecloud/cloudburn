import { describe, expect, it, vi } from 'vitest';
import { COMMENT_MARKER, upsertPullRequestComment } from '../src/comment.js';

const octokitWith = (pages: Array<Array<{ id: number; body?: string }>>) => {
  const rest = {
    issues: {
      listComments: vi.fn(),
      updateComment: vi.fn(),
      createComment: vi.fn(),
    },
  };
  return {
    paginate: {
      iterator: vi.fn(async function* () {
        for (const data of pages) {
          yield { data };
        }
      }),
    },
    rest,
    // biome-ignore lint/suspicious/noExplicitAny: test double for the octokit client
  } as any;
};

const args = { owner: 'towardsthecloud', repo: 'cloudburn', issueNumber: 42, body: '## CloudBurn scan\n\nbody' };
const markedBody = `${args.body}\n\n${COMMENT_MARKER}`;

describe('upsertPullRequestComment', () => {
  it('updates the existing comment that carries the marker', async () => {
    const octokit = octokitWith([
      [
        { id: 1, body: 'unrelated comment' },
        { id: 7, body: `## Old heading\n\nolder body\n\n${COMMENT_MARKER}` },
      ],
    ]);
    const status = await upsertPullRequestComment({ octokit, ...args });
    expect(status).toBe('updated');
    expect(octokit.rest.issues.updateComment).toHaveBeenCalledWith({
      owner: 'towardsthecloud',
      repo: 'cloudburn',
      comment_id: 7,
      body: markedBody,
    });
    expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('stops paging once a marked comment is found', async () => {
    const octokit = octokitWith([[{ id: 7, body: COMMENT_MARKER }], [{ id: 9, body: COMMENT_MARKER }]]);
    const status = await upsertPullRequestComment({ octokit, ...args });
    expect(status).toBe('updated');
    expect(octokit.rest.issues.updateComment).toHaveBeenCalledWith(expect.objectContaining({ comment_id: 7 }));
  });

  it('creates a comment when none carries the marker', async () => {
    const octokit = octokitWith([[{ id: 1, body: '## CloudBurn scan\n\nunrelated' }]]);
    const status = await upsertPullRequestComment({ octokit, ...args });
    expect(status).toBe('created');
    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: 'towardsthecloud',
      repo: 'cloudburn',
      issue_number: 42,
      body: markedBody,
    });
  });
});
