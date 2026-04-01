---
name: roadmap
description: >
  Create and manage CloudBurn roadmap items. Use this skill whenever the user wants to add
  a feature request, improvement idea, or any item to the CloudBurn roadmap.
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

Example: "Add a rule that detects idle RDS instances with zero connections over 14 days" — you know the what, why, and scope. Go create it.

### When the request is vague

If the request is too vague, use the `AskUserQuestion` tool to gather what you need. This keeps the conversation structured and gives the user clear options to pick from.

Guidelines:
- **One round of questions** — use `AskUserQuestion` with 1-3 focused questions to fill the gaps
- **Prefer multiple choice options** — offer 2-4 concrete choices per question so the user can pick rather than type
- **Stay focused** — you're writing a GitHub issue, not architecting a solution
- **Use good headers** — short labels like "Scope", "Priority", "Service" to keep it scannable

Example: if the user says "we should support Azure", use `AskUserQuestion` with a question like:

- **Header**: "Scope"
- **Question**: "Azure is a big surface area — where should we start?"
- **Options**:
  - "Static IaC scanning" — Scan Terraform/ARM templates for Azure cost issues
  - "Live discovery" — Detect idle Azure compute resources in real accounts
  - "Both" — Start with IaC scanning and add live discovery next

After the user responds, you should have enough to proceed. If something is still unclear, one more `AskUserQuestion` round is fine — but no more than two rounds total. Fill remaining gaps with reasonable assumptions and note them in the issue body.

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

**Step 1** — Create the GitHub issue:

```bash
gh issue create \
  --repo towardsthecloud/cloudburn \
  --title "<title>" \
  --label "<label>" \
  --body "$(cat <<'EOF'
<body>
EOF
)"
```

Capture the issue URL from the output.

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

**Step 4** — Confirm to the user with the issue title, label, and link. Keep it brief.

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
