---
'@cloudburn/vscode': minor
---

Add a VS Code extension that runs CloudBurn's CLI on saved Terraform and CloudFormation workspaces, displays cost
findings and incomplete scans, and links to rule documentation and the CI guide. Saved shared configs refresh each
referencing workspace, including explicit symlink aliases, while file changes retain mandatory refreshes even when save
scans are disabled. Findings without source locations appear as workspace diagnostics alongside scan coverage warnings.
Publish its tested VSIX to Visual Studio Marketplace and Open VSX through a scoped tag release workflow with PAT-based
authentication.
