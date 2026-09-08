import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
const config = JSON.parse(readFileSync(new URL('../.changeset/config.json', import.meta.url), 'utf8'));
const entry = config.changelog[0];
const loaded = require(entry.startsWith('.') ? resolve(root, '.changeset', entry) : entry);
const changelog = loaded.default ?? loaded;
const options = config.changelog[1];
const transient = { errors: [{ message: 'Something went wrong while executing your query on 2026-09-08T14:00:39Z.' }] };

async function github(t, respond) {
  const previous = { GITHUB_TOKEN: process.env.GITHUB_TOKEN, GITHUB_GRAPHQL_URL: process.env.GITHUB_GRAPHQL_URL };
  let requests = 0;
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests += 1;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(respond(JSON.parse(body).query, requests, response)));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.GITHUB_TOKEN = 'synthetic-changelog-token';
  process.env.GITHUB_GRAPHQL_URL = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });
  return () => requests;
}

function success(query) {
  return {
    data: {
      a0: Object.fromEntries(
        [...query.matchAll(/a([a-f0-9]+): object/g)].map(([, commit]) => [
          `a${commit}`,
          {
            commitUrl: `https://github.com/towardsthecloud/cloudburn/commit/${commit}`,
            associatedPullRequests: {
              nodes: [
                {
                  number: 258,
                  url: 'https://github.com/towardsthecloud/cloudburn/pull/258',
                  mergedAt: '2026-09-08T14:00:00Z',
                  author: { login: 'contributor', url: 'https://github.com/contributor' },
                },
              ],
            },
            author: { user: null },
          },
        ]),
      ),
    },
  };
}

const changeset = (name) => ({
  id: name,
  summary: 'Preserve dataset attribution.',
  releases: [{ name: '@cloudburn/sdk', type: 'patch' }],
  commit: createHash('sha1').update(name).digest('hex'),
});

test('retries the release-run GraphQL failure and preserves GitHub changelog links', async (t) => {
  const requests = await github(t, (query, attempt) => (attempt === 1 ? transient : success(query)));
  const line = await changelog.getReleaseLine(changeset(t.name), 'patch', options);
  assert.equal(requests(), 2);
  assert.match(line, /\[#258\]\(https:\/\/github.com\/towardsthecloud\/cloudburn\/pull\/258\)/);
  assert.match(line, /Thanks \[@contributor\]/);
  assert.match(line, /Preserve dataset attribution\./);
});

test('bounds a persistent internal failure to three attempts and fails the changelog', {
  timeout: 10000,
}, async (t) => {
  const requests = await github(t, () => transient);
  await assert.rejects(
    changelog.getReleaseLine(changeset(t.name), 'patch', options),
    /Something went wrong while executing your query/,
  );
  assert.equal(requests(), 3);
});

for (const [name, body, status] of [
  ['authentication failure', { message: 'Bad credentials' }, 401],
  ['permission failure', { errors: [{ type: 'FORBIDDEN', message: 'Resource not accessible by integration' }] }, 200],
  ['mixed permanent and internal errors', { errors: [...transient.errors, { message: 'Invalid query field' }] }, 200],
]) {
  test(`does not retry ${name}`, async (t) => {
    const requests = await github(t, (_query, _attempt, response) => {
      response.statusCode = status;
      return body;
    });
    await assert.rejects(changelog.getReleaseLine(changeset(t.name), 'patch', options), /Fetched data from GitHub/);
    assert.equal(requests(), 1);
  });
}

test('batches concurrent release and dependency lookups again after a shared failure', async (t) => {
  const requests = await github(t, (query, attempt) => (attempt === 1 ? transient : success(query)));
  const first = changeset(t.name);
  const [release, dependency, other] = await Promise.all([
    changelog.getReleaseLine(first, 'patch', options),
    changelog.getDependencyReleaseLine([first], [{ name: '@cloudburn/sdk', newVersion: '1.2.3' }], options),
    changelog.getReleaseLine(changeset(`${t.name}-other`), 'patch', options),
  ]);
  assert.equal(requests(), 2);
  assert.match(release, /Preserve dataset attribution\./);
  assert.match(other, /Preserve dataset attribution\./);
  assert.match(dependency, /Updated dependencies/);
  assert.match(dependency, /cloudburn\/commit\//);
  assert.match(dependency, /@cloudburn\/sdk@1\.2\.3/);
});
