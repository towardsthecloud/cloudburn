# CloudBurn for VS Code

Catch AWS cost waste before you commit. Check Terraform HCL (`.tf`) and CloudFormation JSON/YAML with the same CLI
rules and configuration you run in CI. Terraform JSON (`.tf.json`) is not currently parsed by the CLI.

---

<!-- TIP-LIST:START -->
> [!TIP]
> **Stop AWS bill surprises before they ship.**
>
> Most infrastructure changes look harmless until next month's AWS bill lands. [CloudBurn](https://cloudburn.io) analyzes the cost impact of your AWS CDK changes right in the GitHub pull request, so expensive mistakes get caught during code review, while a fix is still a one-line change.
>
> <a href="https://github.com/marketplace/cloudburn-io"><img alt="Install CloudBurn from GitHub Marketplace" src="https://img.shields.io/badge/Install%20CloudBurn-GitHub%20Marketplace-brightgreen.svg?style=for-the-badge&logo=github"/></a>
>
> <details>
> <summary>💰 <strong>Set it up once, then never be surprised by AWS costs again</strong></summary>
> <br/>
>
> 1. **Install the free [CDK Diff PR Commenter GitHub Action](https://github.com/marketplace/actions/aws-cdk-diff-pr-commenter)** in the repository where you build your AWS CDK infrastructure
> 2. **Then install the [CloudBurn GitHub App](https://github.com/marketplace/cloudburn-io)** on the same repository
>
> From then on, every PR with infrastructure changes gets a comment with your CDK diff analysis, and CloudBurn adds a cost report next to it:
>
> - **Monthly cost impact**: whether this change raises or lowers your AWS bill, and by how much
> - **Per-resource breakdown**: which resources drive the change, old versus new monthly cost
> - **Region-aware pricing**: rates match the region your infrastructure actually deploys to
>
> Cost review happens inside code review, so you optimize as you code, while the context is still fresh.
>
> CloudBurn is free during beta. After launch, a free Community plan (1 repository, unlimited users) stays available.
>
> </details>
<!-- TIP-LIST:END -->

![Terraform cost findings in VS Code, with an inline warning, linked rule IDs in Problems, and the CloudBurn status count](media/terraform-findings.png)

## Features

- Cost findings in the Problems panel and inline diagnostics, with links to rule explanations and remediation.
- Workspace-folder scans after saving Terraform, JSON, or YAML, debounced to avoid overlapping work.
- Editor renames and deletions refresh affected folders, including skipped-file warnings, even with save scans disabled.
- **CloudBurn: Scan Workspace** scans every local folder in a multi-root workspace.
- Overlapping workspace folders share one scan using the outermost folder's settings, avoiding duplicate findings.
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

### See it in action

Change `gp2` to `gp3`, then save. CloudBurn reruns the CLI against the saved workspace and clears the warning.
This short animation shows the manual edit, save, and completed scan in a real VS Code temporary profile.

![Animated demo: select gp2 in Terraform, change it to gp3, save, and see Problems clear with CloudBurn showing zero findings](media/scan-on-save.gif)

CloudFormation gets the same checks. Open an inline finding to see its rule ID and follow the link for remediation.

![CloudFormation YAML with an inline EBS cost finding, a rule documentation link, and workspace findings in Problems](media/cloudformation-finding.png)

## Settings

| Setting                | Default     | Purpose                                                    |
| ---------------------- | ----------- | ---------------------------------------------------------- |
| `cloudburn.scanOnSave` | `true`      | Scan the containing folder after saving a supported file.  |
| `cloudburn.executable` | `cloudburn` | Executable on PATH, or an absolute executable path.        |
| `cloudburn.arguments`  | `[]`        | Launcher arguments before `--format json scan <folder>`.   |
| `cloudburn.configPath` | `""`        | Explicit config path, relative to each folder or absolute. |

An empty `configPath` preserves the CLI's discovery of `.cloudburn.yml` or `.cloudburn.yaml` from the workspace folder.
Use an explicit path when the editor inherits a CI environment. Separate workspace folders can have their own settings.
When folders overlap, the outermost folder owns the scan and its settings, including save scans and the config path.
See the [CLI configuration guide](https://cloudburn.io/docs/cli/configuration) for rule selection and suppressions.
Changing `scanOnSave` preserves current findings. Changing the launcher, arguments, or config path rescans folders
that have already been scanned.

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

From the monorepo root, use the pinned runtimes in
[local development](https://github.com/towardsthecloud/cloudburn/blob/main/docs/guides/local-development.md):

```bash
pnpm exec turbo run build --filter @cloudburn/vscode
pnpm exec turbo run test:e2e --filter @cloudburn/vscode
pnpm exec turbo run package:vsix --filter @cloudburn/vscode
```

The workspace package is `@cloudburn/vscode`. Its build generates `dist/vscode/` with the public extension name
`cloudburn-vscode`, the source package version, and publisher `dannysteenman`. Editor tests and packaging use this
generated directory; edit the source manifest and listing assets rather than the generated files.

Packaging requires `vsce` (`npm install --global @vscode/vsce`) and creates `packages/vscode/dist/cloudburn.vsix`.
Only the manifest, README, changelog, license, icon, README images/demo, and extension bundle ship.
The CLI is installed separately; SDK code, AWS libraries, test runners, and workspace dependencies stay out of the VSIX.
Packaging resolves README image links to this package's media on GitHub `main`; merge the assets before publishing.
See the [capture notes](https://github.com/towardsthecloud/cloudburn/blob/main/packages/vscode/media/README.md)
to refresh the screenshots and animation.

E2E tests download VS Code 1.100.3 and run real editor commands against the built CLI in temporary workspaces. They
start with empty folders and verify the first plaintext Terraform save without a Terraform language extension.
Linux uses `xvfb-run` when no display is available. Set `CLOUDBURN_VSCODE_EXECUTABLE` to test another installed editor.
Temporary workspaces are removed after each run.

Release publishing follows the scoped `@cloudburn/vscode@<version>` tag after Changesets versioning. The release
workflow validates and packages once, then uploads the same VSIX to Visual Studio Marketplace and Open VSX using
`VSCE_TOKEN` and `OPEN_VSX_TOKEN` repository Actions secrets. See the
[release guide](https://github.com/towardsthecloud/cloudburn/blob/main/docs/guides/releasing.md#vs-code-extension)
for publisher setup and retries.
