import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Build first. Each observation measures a fresh process through successful exit.
const samples = Number(process.argv[2] ?? 20);
if (!Number.isSafeInteger(samples) || samples < 15) {
  throw new Error('Usage: node scripts/benchmark-startup.mjs [samples >= 15]');
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'packages/cloudburn/dist/cli.js');
const sdk = join(root, 'packages/sdk/dist');
const fixtures = join(root, 'packages/cloudburn/test/e2e/fixtures/ebs');
const scenarios = [
  { name: 'empty-node', args: ['--eval', ''] },
  { name: 'cli-version', args: [cli, '--version'] },
  { name: 'cli-help', args: [cli, '--help'] },
  ...['terraform', 'cloudformation'].map((format) => ({
    name: `scan-${format}`,
    args: [cli, 'scan', join(fixtures, format), '--format', 'json', '--enabled-rules', 'CLDBRN-AWS-EBS-1'],
  })),
  { name: 'sdk-esm-import', args: ['--input-type=module', '--eval', `await import(${JSON.stringify(pathToFileURL(join(sdk, 'index.js')).href)})`] },
  { name: 'sdk-cjs-require', args: ['--eval', `require(${JSON.stringify(join(sdk, 'index.cjs'))})`] },
];
const directory = mkdtempSync(join(tmpdir(), 'cloudburn-startup-'));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('AWS_') && key !== 'NODE_OPTIONS'));
Object.assign(env, {
  HOME: directory,
  XDG_CONFIG_HOME: directory,
  XDG_CACHE_HOME: directory,
  AWS_CONFIG_FILE: join(directory, 'absent-config'),
  AWS_SHARED_CREDENTIALS_FILE: join(directory, 'absent-credentials'),
  AWS_EC2_METADATA_DISABLED: 'true',
  NO_COLOR: '1',
});
const hook = join(directory, 'measure-modules.mjs');
const moduleOutput = join(directory, 'modules.json');
writeFileSync(hook, `
import { registerHooks } from 'node:module';
import { writeFileSync } from 'node:fs';
const loaded = new Set();
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (url.startsWith('file:')) loaded.add(url);
  return result;
}});
process.on('exit', () => writeFileSync(${JSON.stringify(moduleOutput)}, JSON.stringify([...loaded])));
`);

function run(scenario, instrument = false) {
  const start = performance.now();
  const result = spawnSync(process.execPath, [...(instrument ? ['--import', hook] : []), ...scenario.args], {
    cwd: directory, env, encoding: 'utf8', timeout: 30_000,
  });
  const elapsed = performance.now() - start;
  if (result.error || result.status !== 0) {
    throw new Error(`${scenario.name}: ${result.error?.message ?? result.stderr ?? result.status}`);
  }
  if (scenario.name.startsWith('scan-')) {
    const output = JSON.parse(result.stdout);
    if (!output.providers?.length) throw new Error(`${scenario.name}: expected fixture findings`);
  }
  return elapsed;
}

try {
  const timings = new Map(scenarios.map((scenario) => [scenario.name, []]));
  for (const scenario of scenarios) run(scenario);
  // Rotate the first scenario each round to spread ordering effects.
  for (let round = 0; round < samples; round++) {
    for (let offset = 0; offset < scenarios.length; offset++) {
      const scenario = scenarios[(round + offset) % scenarios.length];
      timings.get(scenario.name).push(run(scenario));
    }
  }
  const results = scenarios.map((scenario) => {
    const values = timings.get(scenario.name).sort((a, b) => a - b);
    const at = (quantile) => Number(values[Math.max(0, Math.ceil(values.length * quantile) - 1)].toFixed(2));
    // Instrumentation is deliberately excluded from wall-clock observations.
    run(scenario, true);
    const modules = JSON.parse(readFileSync(moduleOutput, 'utf8'));
    const awsModules = modules.filter((url) => url.includes('/@aws-sdk/'));
    const awsClients = [...new Set(awsModules.flatMap((url) => url.match(/\/@aws-sdk\/(client-[^/]+)/)?.[1] ?? []))].sort();
    return {
      name: scenario.name,
      milliseconds: { min: at(0), p50: at(0.5), p90: at(0.9), max: at(1) },
      modules: { files: modules.length, awsFiles: awsModules.length, awsClients },
    };
  });
  console.log(JSON.stringify({
    measuredAt: new Date().toISOString(),
    runtime: { node: process.version, platform: platform(), release: release(), arch: process.arch, cpu: cpus()[0]?.model },
    samples, warmupsPerScenario: 1, results,
  }, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
