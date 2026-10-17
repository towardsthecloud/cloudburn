## Summary

- What changed?
- Why was this needed?

## Diagram

<!-- Insert Mermaid diagram to visualize changes-->

## Scope

- [ ] `cloudburn` (cli)
- [ ] `@cloudburn/action`
- [ ] `@cloudburn/mcp` (MCP server and agent plugin)
- [ ] `@cloudburn/vscode` (VS Code extension)
- [ ] `@cloudburn/sdk`
- [ ] `@cloudburn/rules`
- [ ] docs/community files

## Release Notes

- [ ] Added a `.changeset/*.md` file for user-facing package changes
- [ ] No user-facing package changes in this PR

## Verification

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm verify`

## Boundary Checks

- [ ] No engine/parser/provider logic added to `@cloudburn/rules`
- [ ] CLI delegates scan logic to SDK

## Documentation

<!-- Name each docs/ page, README, AGENTS.md, or REVIEW.md that owns a fact this change touched, by path: updated,
or why it stays true. Include every page `node scripts/check-owning-pages.mjs --since origin/main --body <file>`
lists; the Owning pages check runs it on this section. See docs/README.md#maintenance. Write "n/a: <reason>" when
none does. -->

- Owning pages and whether each was updated:

## Related Issues

Closes #
