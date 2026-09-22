import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { CloudBurnClient } from '@cloudburn/sdk';
import { emitAnnotations } from './annotations.js';
import { upsertPullRequestComment } from './comment.js';
import { formatError } from './error.js';
import { flattenFindings } from './findings.js';
import { getInputs } from './inputs.js';
import { renderScanMarkdown } from './markdown.js';
import { failureSummary, resolvePolicy } from './policy.js';

const resultFilePath = (): string => join(process.env.RUNNER_TEMP ?? tmpdir(), `cloudburn-scan-${process.pid}.json`);

const maybePostComment = async (inputs: { comment: boolean; token: string }, body: string): Promise<void> => {
  if (!inputs.comment) {
    core.info('Pull request comment disabled via the comment input.');
    return;
  }
  if (github.context.eventName !== 'pull_request') {
    core.info(`Event "${github.context.eventName}" is not a pull request; skipping the findings comment.`);
    return;
  }
  const issueNumber = github.context.issue.number;
  if (issueNumber === undefined) {
    core.warning('Pull request number unavailable in the event payload; skipping the findings comment.');
    return;
  }
  if (inputs.token === '') {
    core.warning('No GitHub token supplied; skipping the findings comment.');
    return;
  }

  const octokit = github.getOctokit(inputs.token);
  try {
    const status = await upsertPullRequestComment({
      octokit,
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issueNumber,
      body,
    });
    core.info(`Pull request findings comment ${status}.`);
  } catch (err) {
    // A comment failure (permissions, rate limits) must not fail the scan itself.
    core.warning(`Failed to post the findings comment: ${err instanceof Error ? err.message : String(err)}`);
  }
};

const run = async (): Promise<void> => {
  const inputs = getInputs();
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const scanRoot = resolve(workspace, inputs.path);
  const configPath = inputs.configPath === undefined ? undefined : resolve(workspace, inputs.configPath);

  const scanner = new CloudBurnClient({ debugLogger: (message) => core.debug(message) });
  const result = await scanner.scanStatic(scanRoot, inputs.scanOverride, { configPath });

  const findings = flattenFindings(result);
  const suppressed = result.suppressed ?? [];
  const diagnostics = result.diagnostics ?? [];

  const resultFile = resultFilePath();
  await writeFile(resultFile, `${JSON.stringify(result, null, 2)}\n`);

  const markdown = renderScanMarkdown({ findings, suppressed, diagnostics }, { header: inputs.header });

  core.setOutput('findings-count', findings.length);
  core.setOutput('suppressed-count', suppressed.length);
  core.setOutput('result-file', resultFile);
  core.setOutput('markdown', markdown);

  await core.summary.addRaw(markdown).write();

  if (inputs.annotations) {
    const emitted = emitAnnotations(findings, { workspace, scanRoot });
    core.info(`Emitted ${emitted} annotation${emitted === 1 ? '' : 's'}.`);
  }

  const policy = resolvePolicy(result, inputs);
  core.setOutput('failed', policy.violated);

  await maybePostComment(inputs, markdown);

  if (policy.violated) {
    core.setFailed(failureSummary(policy));
  } else {
    core.info(`CloudBurn scan passed: ${findings.length} finding(s), ${suppressed.length} suppressed.`);
  }
};

run().catch((err) => {
  core.setFailed(formatError(err));
});
