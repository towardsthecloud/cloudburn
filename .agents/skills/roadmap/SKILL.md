---
name: roadmap
description: >
  Create a GitHub issue and add it to the CloudBurn roadmap when the user requests a roadmap
  item. Do not trigger for feature implementation, bug fixes, or brainstorming without a
  request to record an item.
---

# CloudBurn Roadmap Skill

You help users add items to the [CloudBurn Roadmap](https://github.com/orgs/towardsthecloud/projects/4) GitHub Project board. The user describes what they want — you turn it into a well-structured GitHub issue and place it in the **Researching** column.

## Phase 1: Understand the request

Before creating anything, assess whether you have enough context to write a useful issue. You need three things:

1. **What** — what should CloudBurn do that it doesn't today?
2. **Why** — what's the cost optimization value or user benefit?
3. **Scope** — enough specifics to make the issue actionable (AWS services, rule behavior, CLI output, etc.)

### When the request is clear

If the user gives you enough detail to answer all three confidently, skip straight to Phase 2. Don't interview for the sake of interviewing.

Example: "Add a roadmap item for a rule that detects idle RDS instances with zero connections over 14 days" — you know the what, why, and scope. Create the issue and add it to the roadmap.

### When the request is vague

If missing product intent prevents a useful issue, ask a concise question using the available user-input tool or plain text. Infer routine details from context and prepare the issue while awaiting any blocking answer.

Guidelines:
- **Ask only what blocks the issue** — group related missing details into a concise question
- **Prefer multiple choice options** — offer 2-4 concrete choices per question so the user can pick rather than type
- **Stay focused** — you're writing a GitHub issue, not architecting a solution
- **Use good headers** — short labels like "Scope", "Priority", "Service" to keep it scannable

Example: if the user asks to add Azure support to the roadmap without a scope, ask a question like:

- **Header**: "Scope"
- **Question**: "Azure is a big surface area — where should we start?"
- **Options**:
  - "Static IaC scanning" — Scan Terraform/ARM templates for Azure cost issues
  - "Live discovery" — Detect idle Azure compute resources in real accounts
  - "Both" — Start with IaC scanning and add live discovery next

After the user responds, complete the requested roadmap item. Note reasonable assumptions in the issue body; do not infer unresolved product intent from silence or a fixed number of question rounds.

## Phase 2: Create the roadmap item

### Classify the label

| Label           | Use when...                                                        |
| --------------- | ------------------------------------------------------------------ |
| `enhancement`   | New feature, capability, rule, or improvement to existing behavior |
| `bug`           | Something is broken or behaving incorrectly                        |
| `documentation` | Docs are missing, unclear, or need updating                        |

Default to `enhancement` — most roadmap items are enhancements.

### Write the issue

**Title**: Short, specific, action-oriented. Start with a verb when natural. Keep under 70 characters.

Examples:
- "Add S3 lifecycle policy cost optimization rule"
- "Support Azure resource discovery"
- "Show estimated monthly savings in scan output"

**Body**: Clear, well-structured description. Adapt the structure to what makes sense — not every issue needs every section:

- **What**: What should CloudBurn do that it doesn't today?
- **Why**: What's the cost optimization value or user benefit?
- **Details**: Any specifics (AWS services, rule behavior, output format, etc.)

Keep it concise. Don't pad with filler or repeat the title in the body.

### Execute

**Step 1** — Write the exact issue body to a temporary UTF-8 file outside the repository, then create the GitHub issue:

```bash
gh issue create \
  --repo towardsthecloud/cloudburn \
  --title "<title>" \
  --label "<label>" \
  --body-file <absolute-path-to-body-file>
```

Capture the issue URL from the output and remove the temporary body file after successful creation.

**Step 2** — Add the issue to the roadmap project:

```bash
gh project item-add 4 --owner towardsthecloud --url <issue-url> --format json
```

Extract the `id` field from the JSON response.

**Step 3** — Set status to "Researching":

```bash
gh project item-edit \
  --project-id PVT_kwDOC--Ra84BG8XH \
  --id <item-id> \
  --field-id PVTSSF_lADOC--Ra84BG8XHzg317rI \
  --single-select-option-id f75ad846
```

**Step 4** — Report the issue title, label, and link after all requested steps succeed. If project placement or status fails,
retain the issue URL and retry only the failed step; do not create a duplicate issue. Report any remaining blocker.

## Reference: Project IDs

Stable identifiers for the CloudBurn Roadmap project board:

- **Project number**: `4`
- **Project node ID**: `PVT_kwDOC--Ra84BG8XH`
- **Org**: `towardsthecloud`
- **Repo**: `towardsthecloud/cloudburn`
- **Status field ID**: `PVTSSF_lADOC--Ra84BG8XHzg317rI`
- **Status options**:
  - Researching: `f75ad846`
  - Coming soon: `8185493e`
  - We're working on it: `47fc9ee4`
  - Shipped: `98236657`
