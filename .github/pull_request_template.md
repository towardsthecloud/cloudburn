## Summary

- What changed?
- Why was this needed?

## Diagram

<!-- Insert Mermaid diagram to visualize changes-->

## Scope

- [ ] `cloudburn` (cli)
- [ ] `@cloudburn/action`
- [ ] `@cloudburn/mcp` (MCP server and agent plugin)
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
- [ ] README/CONTRIBUTING/docs updated when behavior changed

## Related Issues

Closes #
