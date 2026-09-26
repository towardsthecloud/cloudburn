import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const serverPath = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));
const blockAwsPath = fileURLToPath(new URL('../../../cloudburn/test/block-aws.cjs', import.meta.url));
const fixturesPath = fileURLToPath(new URL('../../../cloudburn/test/e2e/fixtures/', import.meta.url));

/**
 * Copies a CLI fixture to an isolated directory and connects an MCP client to the built stdio server,
 * started there as an agent would start it, without ambient AWS credentials or AWS SDK modules.
 * @param t - Test context responsible for cleanup.
 * @param fixture - Fixture directory relative to the CLI e2e fixtures.
 * @returns The connected client, the working directory, and a tool caller that parses JSON text results.
 */
export const connectServer = async (t, fixture) => {
  const directory = mkdtempSync(join(tmpdir(), 'cloudburn-mcp-e2e-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  cpSync(join(fixturesPath, fixture), directory, { recursive: true });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--require', blockAwsPath, serverPath],
    cwd: directory,
    stderr: 'pipe',
    env: {
      PATH: [dirname(process.execPath), process.env.PATH].join(delimiter),
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_CONFIG_FILE: join(directory, 'absent-aws-config'),
      AWS_SHARED_CREDENTIALS_FILE: join(directory, 'absent-aws-credentials'),
    },
  });
  let stderr = '';
  transport.stderr?.on('data', (chunk) => {
    stderr += chunk;
  });
  const client = new Client({ name: 'cloudburn-mcp-e2e', version: '0.0.0' });
  await client.connect(transport);
  t.after(() => client.close());
  return {
    client,
    directory,
    stderr: () => stderr,
    call: async (name, args = {}) => {
      const result = await client.callTool({ name, arguments: args });
      const [content] = result.content;
      return { isError: result.isError === true, body: JSON.parse(content.text) };
    },
  };
};

/**
 * Extracts stable finding identities and locations without discarding meaningful scan evidence.
 * @param output - Parsed scan result.
 * @returns Findings sorted independently of provider/rule traversal order.
 */
export const findingIdentities = (output) =>
  output.providers
    .flatMap((provider) =>
      provider.rules.flatMap((rule) =>
        rule.findings.map((finding) => ({
          ruleId: rule.ruleId,
          resourceId: finding.resourceId,
          location: finding.location,
        })),
      ),
    )
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
