# Startup benchmarks

[The benchmark script](../../scripts/benchmark-startup.mjs) measures built CLI startup, static fixture scans, and both SDK
module formats. It prints JSON to stdout for comparison between checkouts:

```sh
pnpm exec turbo run build --force
node scripts/benchmark-startup.mjs 20 > /tmp/cloudburn-startup.json
```

The optional argument is the number of observations per scenario (default: 20; minimum: 15). Build the checkout before each
run. Keep the Node version, machine, fixtures, sample count, and benchmark script identical when comparing changes.

## Measurement method

Each observation starts a fresh Node process and measures elapsed wall-clock time through successful exit, including
process creation. Each scenario runs once before measurement to warm filesystem caches. Scenario order rotates between
rounds. These are fresh-process observations with warm filesystem caches, not cold-disk measurements.

The distribution reports milliseconds as minimum, p50, p90, and maximum. Percentiles use the nearest-rank method. Empty Node
provides a process-startup baseline; its duration is not subtracted from other results. Static scans include parsing and
evaluation, so their timings cover the complete command. Scan output must contain fixture findings and all commands must
exit successfully for a run to complete.

The Terraform and CloudFormation scenarios use the checked-in
[EBS fixtures](../../packages/cloudburn/test/e2e/fixtures/ebs/) with `CLDBRN-AWS-EBS-1` enabled and JSON output. Each fixture
contains a gp2 volume and a gp3 volume. SDK scenarios load the built `index.js` or `index.cjs` entry without creating a
scanner. Package installation and export-map compatibility have separate package tests.

Children run from a temporary directory with isolated home, config, and cache locations. Ambient `AWS_*` variables and
`NODE_OPTIONS` are removed, AWS config and credential files point to absent files, and EC2 metadata credentials are disabled.
The scenarios make no live AWS requests. The temporary files are removed when the benchmark exits.

Module counts come from one additional, untimed process per scenario using Node's synchronous `registerHooks` load hook.
The count includes distinct loaded file URLs and excludes built-ins and the instrumentation module. AWS file counts match
`/@aws-sdk/`; AWS client counts are distinct `@aws-sdk/client-*` package names. Bundled source modules count as their emitted
file, so these counts describe runtime file loading rather than TypeScript source-module counts. Instrumentation does not
affect the reported timing distribution.

## Issue 234 measurements

The baseline was built from `779d55f66ff594844a2e7088b7ae2c4d92a81108` after cache and progress integration merged. The same
script, fixtures, and 20 observations per scenario were used before and after the startup changes. Measurements ran on an
Apple M4 with Node v24.18.0, Darwin 25.6.0, and arm64 architecture. The baseline completed on 2026-09-08 at 13:03 UTC; the
updated build completed measurement at 13:06 UTC. Both builds used `pnpm exec turbo run build --force`.

| Scenario             | Before min | Before p50 | Before p90 | Before max |
| -------------------- | ---------: | ---------: | ---------: | ---------: |
| Empty Node           |      20.59 |      22.85 |      24.85 |      29.73 |
| CLI `--version`      |     362.98 |     389.65 |     437.91 |     585.68 |
| CLI `--help`         |     364.66 |     382.21 |     458.17 |     608.08 |
| Terraform scan       |     367.08 |     392.07 |     459.37 |     499.03 |
| CloudFormation scan  |     363.06 |     397.63 |     437.14 |     445.79 |
| SDK ESM import       |     359.36 |     382.74 |     421.46 |     442.10 |
| SDK CommonJS require |     328.71 |     339.83 |     392.93 |     523.27 |

| Scenario             | After min | After p50 | After p90 | After max | p50 reduction |
| -------------------- | --------: | --------: | --------: | --------: | ------------: |
| Empty Node           |     19.34 |     20.96 |     22.81 |     23.14 |          8.3% |
| CLI `--version`      |    105.83 |    106.84 |    109.87 |    114.01 |         72.6% |
| CLI `--help`         |    105.92 |    108.25 |    110.41 |    112.64 |         71.7% |
| Terraform scan       |    108.93 |    112.22 |    118.50 |    138.01 |         71.4% |
| CloudFormation scan  |    105.45 |    110.59 |    112.43 |    112.97 |         72.2% |
| SDK ESM import       |     99.44 |    102.85 |    105.00 |    117.96 |         73.1% |
| SDK CommonJS require |     98.34 |    101.35 |    106.67 |    117.74 |         70.2% |

Before the change, every CLI and SDK scenario loaded all 29 AWS client packages: 54 AWS SDK files among 216 total files for
the CLI and 207 for each SDK format. After the change, all measured scenarios loaded 0 AWS SDK files and 0 AWS client
packages. Total loaded files fell to 129 for the CLI and 120 for each SDK format. Empty Node loaded 0 files in both runs.

Median CLI metadata commands and static scans took about 71% to 73% less time in this run. The empty-process baseline also
improved by 8.3%, which shows some run-to-run variation unrelated to application changes. The module observations establish
that the AWS client graph was removed from these startup paths independently of timing noise.

Timing distributions describe this machine and workload. They are evidence for this change, not CI speed gates or a
cross-machine performance guarantee. Structural tests check that metadata and static paths avoid discovery dependencies.
