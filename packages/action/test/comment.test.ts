import { describe, expect, it, vi } from 'vitest';
import { COMMENT_MARKER, upsertPullRequestComment } from '../src/comment.js';

const ACTOR = 'github-actions[bot]';

type StubComment = { id: number; body?: string; user?: { login: string } };
const own = (id: number, body: string): StubComment => ({ id, body, user: { login: ACTOR } });

const octokitWith = (pages: StubComment[][]) => {
  const rest = {
    issues: {
      listComments: vi.fn(),
      updateComment: vi.fn(),
      createComment: vi.fn(),
    },
    users: {
      getAuthenticated: vi.fn(async () => ({ data: { login: ACTOR } })),
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
  it('updates the existing comment that carries the marker from the same actor', async () => {
    const octokit = octokitWith([
      [
        { id: 1, body: `unrelated ${COMMENT_MARKER}`, user: { login: 'someone-else' } },
        own(7, `## Old heading\n\nolder body\n\n${COMMENT_MARKER}`),
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

  it('stops paging once an owned marked comment is found', async () => {
    const octokit = octokitWith([[own(7, COMMENT_MARKER)], [own(9, COMMENT_MARKER)]]);
    const status = await upsertPullRequestComment({ octokit, ...args });
    expect(status).toBe('updated');
    expect(octokit.rest.issues.updateComment).toHaveBeenCalledWith(expect.objectContaining({ comment_id: 7 }));
  });

  it('creates a comment when none carries the marker from this actor', async () => {
    const octokit = octokitWith([
      [{ id: 1, body: `## CloudBurn scan\n\n${COMMENT_MARKER}`, user: { login: 'other-bot[bot]' } }],
    ]);
    const status = await upsertPullRequestComment({ octokit, ...args });
    expect(status).toBe('created');
    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: 'towardsthecloud',
      repo: 'cloudburn',
      issue_number: 42,
      body: markedBody,
    });
  });

  it('falls back to marker matching when the authenticated user is unavailable', async () => {
    const octokit = octokitWith([[own(7, COMMENT_MARKER)]]);
    octokit.rest.users.getAuthenticated.mockRejectedValue(new Error('Resource not accessible'));
    const status = await upsertPullRequestComment({ octokit, ...args });
    expect(status).toBe('updated');
    expect(octokit.rest.issues.updateComment).toHaveBeenCalledWith(expect.objectContaining({ comment_id: 7 }));
  });

  it('truncates an oversized body before GitHub rejects it', async () => {
    const octokit = octokitWith([]);
    const status = await upsertPullRequestComment({ octokit, ...args, body: 'x'.repeat(70_000) });
    expect(status).toBe('created');
    const posted = octokit.rest.issues.createComment.mock.calls[0]?.[0].body as string;
    expect(posted.length).toBeLessThan(65_536);
    expect(posted).toContain('Report truncated');
    expect(posted).toContain(COMMENT_MARKER);
  });
});
