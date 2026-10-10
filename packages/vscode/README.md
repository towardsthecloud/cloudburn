# CloudBurn for VS Code

Catch AWS cost waste before you commit. Check Terraform and CloudFormation with the same CLI rules and configuration
you run in CI.

## Features

- Cost findings in the Problems panel and inline diagnostics, with links to rule explanations and remediation.
- Workspace-folder scans after saving Terraform, JSON, or YAML, debounced to avoid overlapping work.
- **CloudBurn: Scan Workspace** scans every local folder in a multi-root workspace.
- The status bar shows findings or an incomplete scan. **CloudBurn: Show Output** opens scan details.
- Existing rule configuration and inline suppressions remain owned by the CLI.

Scans run locally. No AWS account, credentials, API key, or CloudBurn subscription is required. The extension does
not upload source files or collect telemetry, and it does not automatically change infrastructure.

## Get started

1. Install the [CloudBurn CLI](https://cloudburn.io/docs/cli/getting-started):

   ```bash
   brew install towardsthecloud/tap/cloudburn
   ```

   Or, with Node.js 24+: `npm install --global cloudburn`.
2. Install the local VSIX with **Extensions: Install from VSIX**. Marketplace publication is pending.
3. Open and trust a workspace folder. Run **CloudBurn: Scan Workspace**, or save a `.tf`, `.json`, `.yml`, or `.yaml`
   file to scan its containing folder.
4. Open Problems. Select a finding to navigate to the resource; click its rule ID for the explanation and fix.

A Terraform volume with `type = "gp2"` produces `CLDBRN-AWS-EBS-1`. After reviewing the rule and changing it to `gp3`,
save to rerun the scan and clear the finding. High-severity findings appear as errors; medium and low as warnings.
Skipped files and failed scans appear as workspace warnings and in Output. Partial scans never appear as clean scans.

## Settings

| Setting                | Default     | Purpose                                                    |
| ---------------------- | ----------- | ---------------------------------------------------------- |
| `cloudburn.scanOnSave` | `true`      | Scan the containing folder after saving a supported file.  |
| `cloudburn.executable` | `cloudburn` | Executable on PATH, or an absolute executable path.        |
| `cloudburn.arguments`  | `[]`        | Launcher arguments before `--format json scan <folder>`.   |
| `cloudburn.configPath` | `""`        | Explicit config path, relative to each folder or absolute. |

An empty `configPath` preserves the CLI's discovery of `.cloudburn.yml` or `.cloudburn.yaml` from the workspace folder.
Use an explicit path when the editor inherits a CI environment. Each workspace folder can have its own settings.
See the [CLI configuration guide](https://cloudburn.io/docs/cli/configuration) for rule selection and suppressions.

The CLI must be installed on the **extension host**: your computer, SSH host, container, or Codespace running the
workspace extension. Virtual workspaces are unsupported. Scans read saved files, not unsaved buffers. Existing CDK
CloudFormation output can be scanned; the extension does not run `cdk synth` or map findings back to CDK source.

### Local builds and Windows npm installations

Launch the CLI JavaScript with a Node.js 24+ executable to avoid shell wrappers such as `.cmd` files:

```json
{
  "cloudburn.executable": "/absolute/path/to/node",
  "cloudburn.arguments": ["/absolute/path/to/cloudburn/packages/cloudburn/dist/cli.js"]
}
```

On Windows, use `node.exe` and the npm-installed `cloudburn/dist/cli.js`; `npm root --global` identifies the parent
directory. Escape backslashes in JSON paths. Arguments are passed directly; shell syntax is unsupported.
If the CLI is not found, set its absolute path. For errors or the 60-second scan deadline, open Output and try the
same scan in a terminal. CLI output is limited to 16 MiB per scan.

## Run the same checks in CI

**CloudBurn: Run These Checks in CI** opens the [GitHub Action guide](https://cloudburn.io/docs/cli/github-action).
Keep rule configuration in your repository so developers and code review use the same checks.

## Develop and package

From the monorepo root, use the pinned runtimes in [local development](../../docs/guides/local-development.md):

```bash
pnpm exec turbo run build --filter cloudburn-vscode
pnpm exec turbo run test:e2e --filter cloudburn-vscode
pnpm exec turbo run package:vsix --filter cloudburn-vscode
```

Packaging requires `vsce` (`npm install --global @vscode/vsce`) and creates `packages/vscode/dist/cloudburn.vsix`.
Only the manifest, README, changelog, license, icon, and extension bundle ship. The CLI is installed separately;
SDK code, AWS libraries, test runners, and workspace dependencies stay out of the VSIX.

E2E tests download VS Code 1.100.3 and run real editor commands against the built CLI in temporary workspaces.
Linux uses `xvfb-run` when no display is available. Set `CLOUDBURN_VSCODE_EXECUTABLE` to test another installed editor.
Temporary workspaces are removed after each run.
