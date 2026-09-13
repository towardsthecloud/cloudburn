# turbo watch

Full docs: https://turborepo.dev/docs/reference/watch

Re-run tasks automatically when code changes. Dependency-aware.

```bash
turbo watch [tasks]
```

## Basic Usage

```bash
# Watch and re-run build task when code changes
turbo watch build

# Watch multiple tasks
turbo watch build test lint
```

Tasks re-run in order configured in `turbo.json` when source files change.

## With Persistent Tasks

Persistent tasks (`"persistent": true`) won't exit, so they can't be depended on. They work the same in `turbo watch` as `turbo run`.

### Dependency-Aware Persistent Tasks

If your tool has built-in watching (like `next dev`), use its watcher:

```json
{
  "tasks": {
    "dev": {
      "persistent": true,
      "cache": false
    }
  }
}
```

### Non-Dependency-Aware Tools

For tools that don't detect dependency changes, use `interruptible`:

```json
{
  "tasks": {
    "dev": {
      "persistent": true,
      "interruptible": true,
      "cache": false
    }
  }
}
```

`turbo watch` will restart interruptible tasks when dependencies change.

## Limitations

### Caching

Caching is experimental with watch mode:

```bash
turbo watch your-tasks --experimental-write-cache
```

### Task Outputs in Source Control

If tasks write files tracked by git, watch mode may loop infinitely. Watch mode uses file hashes to prevent this but it's not foolproof.

**Recommendation**: Remove task outputs from git.

## vs turbo run

| Feature           | `turbo run` | `turbo watch` |
| ----------------- | ----------- | ------------- |
| Runs once         | Yes         | No            |
| Re-runs on change | No          | Yes           |
| Caching           | Full        | Experimental  |
| Use case          | CI, one-off | Development   |

## Common Patterns

### Development Workflow

```bash
# Run dev servers and watch for build changes
turbo watch dev build
```

### Type Checking During Development

```bash
# Watch and re-run type checks
turbo watch check-types
```

### Dev Task with `^dev` Pattern

A `dev` task with `dependsOn: ["^dev"]` and `persistent: false` in root turbo.json may look unusual but is **correct for `turbo watch` workflows**:

```json
// Root turbo.json
{
  "tasks": {
    "dev": {
      "dependsOn": ["^dev"],
      "cache": false,
      "persistent": false  // Packages have one-shot dev scripts
    }
  }
}

// Package turbo.json (apps/web/turbo.json)
{
  "extends": ["//"],
  "tasks": {
    "dev": {
      "persistent": true  // Apps run long-running dev servers
    }
  }
}
```

**Why this works:**

- **Packages** (e.g., `@acme/db`, `@acme/validators`) have `"dev": "tsc"` — one-shot type generation that completes quickly
- **Apps** override with `persistent: true` for actual dev servers (Next.js, etc.)
- **`turbo watch`** re-runs the one-shot package `dev` scripts when source files change, keeping types in sync

**Intended usage:** Run `turbo watch dev` (not `turbo run dev`). Watch mode re-executes one-shot tasks on file changes while keeping persistent tasks running.

**Alternative pattern:** Use a separate task name like `prepare` or `generate` for one-shot dependency builds to make the intent clearer:

```json
{
  "tasks": {
    "prepare": {
      "dependsOn": ["^prepare"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "dependsOn": ["prepare"],
      "cache": false,
      "persistent": true
    }
  }
}
```
