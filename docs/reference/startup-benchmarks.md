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

## Reference measurements

These distributions ran on an Apple M4 with Node v24.18.0, Darwin 25.6.0, and arm64 architecture, with 20 observations
per scenario after `pnpm exec turbo run build --force`. [#255](https://github.com/towardsthecloud/cloudburn/pull/255)
compares them with the build that imported AWS clients eagerly.

| Scenario | min | p50 | p90 | max |
| --- | ---: | ---: | ---: | ---: |
| Empty Node | 19.34 | 20.96 | 22.81 | 23.14 |
| CLI `--version` | 105.83 | 106.84 | 109.87 | 114.01 |
| CLI `--help` | 105.92 | 108.25 | 110.41 | 112.64 |
| Terraform scan | 108.93 | 112.22 | 118.50 | 138.01 |
| CloudFormation scan | 105.45 | 110.59 | 112.43 | 112.97 |
| SDK ESM import | 99.44 | 102.85 | 105.00 | 117.96 |
| SDK CommonJS require | 98.34 | 101.35 | 106.67 | 117.74 |

All measured scenarios loaded 0 AWS SDK files and 0 AWS client packages. Total loaded files were 129 for the CLI and 120
for each SDK format; Empty Node loaded 0 files. The module counts, not the timings, establish that these startup paths
skip the AWS client graph.

Timing distributions describe this machine and workload. They are not CI speed gates or a cross-machine performance
guarantee. Structural tests check that metadata and static paths avoid discovery dependencies.
