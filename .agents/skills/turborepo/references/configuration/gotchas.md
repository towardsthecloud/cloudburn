# Configuration Gotchas

Common mistakes and how to fix them.

## #1 Root Scripts Not Using `turbo run`

Root scripts that orchestrate package tasks should use `turbo run`. Repository-wide tooling and wrappers may run directly from the root.

```json
// WRONG - bypasses turbo, no parallelization or caching
{
  "scripts": {
    "build": "bun build",
    "dev": "bun dev"
  }
}

// CORRECT - delegates to turbo
{
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev"
  }
}
```

**Why this matters:** Directly invoking a package build tool at the root bypasses Turbo orchestration. A package-manager command such as `npm run build` still uses Turbo when its script delegates to `turbo run build`.

## #2 Bypassing Turbo in Wrappers

Use Turbo for package task dependencies. A root wrapper may sequence a Turbo invocation with repository-wide tooling using `&&` when the latter depends on its success.

```json
// WRONG - package builds bypass Turbo
{
  "scripts": {
    "changeset:publish": "bun build && changeset publish"
  }
}

// CORRECT - use turbo run, let turbo handle dependencies
{
  "scripts": {
    "changeset:publish": "turbo run build && changeset publish"
  }
}
```

If the second command (`changeset publish`) depends on build outputs, the turbo task should run through turbo to get caching and parallelization benefits.

## #3 Overly Broad globalDependencies

`globalDependencies` affects hash for ALL tasks in ALL packages. Be specific.

```json
// WRONG - affects all hashes
{
  "globalDependencies": ["**/.env.*local"]
}

// CORRECT - move to specific tasks that need it
{
  "globalDependencies": [".env"],
  "tasks": {
    "build": {
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": ["dist/**"]
    }
  }
}
```

**Why this matters:** `**/.env.*local` matches .env files in ALL packages, causing unnecessary cache invalidation. Instead:

- Use `globalDependencies` only for truly global files (root `.env`)
- Use task-level `inputs` for package-specific .env files with `$TURBO_DEFAULT$` to preserve default behavior

With `futureFlags.globalConfiguration`, this is less of a concern because `global.inputs` acts as implicit task inputs — tasks can opt out of specific files with negation globs. But keeping the list focused is still good practice.

## #4 Repetitive Task Configuration

Look for repeated configuration across tasks that can be collapsed.

```json
// WRONG - repetitive env and inputs across tasks
{
  "tasks": {
    "build": {
      "env": ["API_URL", "DATABASE_URL"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"]
    },
    "test": {
      "env": ["API_URL", "DATABASE_URL"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"]
    }
  }
}

// BETTER - use globalEnv and globalDependencies
{
  "globalEnv": ["API_URL", "DATABASE_URL"],
  "globalDependencies": [".env*"],
  "tasks": {
    "build": {},
    "test": {}
  }
}
```

**When to use global vs task-level:**

- `globalEnv` / `globalDependencies` - affects ALL tasks, use for truly shared config
- Task-level `env` / `inputs` - use when only specific tasks need it

## #5 Using `../` to Traverse Out of Package in `inputs`

Don't use relative paths like `../` to reference files outside the package. Use `$TURBO_ROOT$` instead.

```json
// WRONG - traversing out of package
{
  "tasks": {
    "build": {
      "inputs": ["$TURBO_DEFAULT$", "../shared-config.json"]
    }
  }
}

// CORRECT - use $TURBO_ROOT$ for repo root
{
  "tasks": {
    "build": {
      "inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/shared-config.json"]
    }
  }
}
```

## #6 Putting Package Work in Root Scripts

**Prefer package tasks over Root Tasks.**

When you need to create a task (build, lint, test, typecheck, etc.), default to package tasks:

1. Add the script to **each relevant package's** `package.json`
2. Register the task in root `turbo.json`
3. Root scripts for these package tasks delegate to `turbo run <task>`

```json
// WRONG - DO NOT DO THIS
// Root package.json with task logic
{
  "scripts": {
    "build": "cd apps/web && next build && cd ../api && tsc",
    "lint": "eslint apps/ packages/",
    "test": "vitest"
  }
}

// CORRECT - DO THIS
// apps/web/package.json
{ "scripts": { "build": "next build", "lint": "eslint .", "test": "vitest" } }

// apps/api/package.json
{ "scripts": { "build": "tsc", "lint": "eslint .", "test": "vitest" } }

// packages/ui/package.json
{ "scripts": { "build": "tsc", "lint": "eslint .", "test": "vitest" } }

// Root package.json - package task entry points delegate
{ "scripts": { "build": "turbo run build", "lint": "turbo run lint", "test": "turbo run test" } }

// turbo.json - register tasks
{
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "lint": {},
    "test": {}
  }
}
```

**Why this matters:**

- Package tasks run in **parallel** across all packages
- Each package's output is cached **individually**
- You can **filter** to specific packages: `turbo run test --filter=web`

Repository-wide tooling and wrappers may run directly from the root. Register a Root Task (`//#taskname`) when a repository-wide operation needs Turbo orchestration; registered Root Tasks must not invoke Turbo recursively.

## #7 Tasks That Need Parallel Execution + Cache Invalidation

Some tasks can run in parallel (don't need built output from dependencies) but must still invalidate cache when dependency source code changes. Using `dependsOn: ["^taskname"]` forces sequential execution. Using no dependencies breaks cache invalidation.

**Use Transit Nodes for these tasks:**

```json
// WRONG - forces sequential execution (SLOW)
"my-task": {
  "dependsOn": ["^my-task"]
}

// ALSO WRONG - no dependency awareness (INCORRECT CACHING)
"my-task": {}

// CORRECT - use Transit Nodes for parallel + correct caching
{
  "tasks": {
    "transit": { "dependsOn": ["^transit"] },
    "my-task": { "dependsOn": ["transit"] }
  }
}
```

**Why Transit Nodes work:**

- `transit` creates dependency relationships without matching any actual script
- Tasks that depend on `transit` gain dependency awareness
- Since `transit` completes instantly (no script), tasks run in parallel
- Cache correctly invalidates when dependency source code changes

**How to identify tasks that need this pattern:** Look for tasks that read source files from dependencies but don't need their build outputs.

## Missing outputs for File-Producing Tasks

**Before flagging missing `outputs`, check what the task actually produces:**

1. Read the package's script (e.g., `"build": "tsc"`, `"test": "vitest"`)
2. Determine if it writes files to disk or only outputs to stdout
3. Only flag if the task produces files that should be cached

```json
// WRONG - build produces files but they're not cached
"build": {
  "dependsOn": ["^build"]
}

// CORRECT - outputs are cached
"build": {
  "dependsOn": ["^build"],
  "outputs": ["dist/**"]
}
```

No `outputs` key is fine for stdout-only tasks. For file-producing tasks, missing `outputs` means Turbo has nothing to cache.

## Forgetting ^ in dependsOn

```json
// WRONG - looks for "build" in SAME package (infinite loop or missing)
"build": {
  "dependsOn": ["build"]
}

// CORRECT - runs dependencies' build first
"build": {
  "dependsOn": ["^build"]
}
```

The `^` means "in dependency packages", not "in this package".

## Missing persistent on Dev Tasks

```json
// WRONG - dependent tasks hang waiting for dev to "finish"
"dev": {
  "cache": false
}

// CORRECT
"dev": {
  "cache": false,
  "persistent": true
}
```

## Package Config Missing extends

```json
// WRONG - packages/web/turbo.json
{
  "tasks": {
    "build": { "outputs": [".next/**"] }
  }
}

// CORRECT
{
  "extends": ["//"],
  "tasks": {
    "build": { "outputs": [".next/**"] }
  }
}
```

Without `"extends": ["//"]`, Package Configurations are invalid.

## Root Tasks Need Special Syntax

To run a task defined only in root `package.json`:

```bash
# WRONG
turbo run format

# CORRECT
turbo run //#format
```

And in dependsOn:

```json
"build": {
  "dependsOn": ["//#codegen"]  // Root package's codegen
}
```

## Overwriting Default Inputs

```json
// WRONG - only watches test files, ignores source changes
"test": {
  "inputs": ["tests/**"]
}

// CORRECT - extends defaults, adds test files
"test": {
  "inputs": ["$TURBO_DEFAULT$", "tests/**"]
}
```

Without `$TURBO_DEFAULT$`, you replace all default file watching.

## Excluding `global.inputs` Without `$TURBO_DEFAULT$`

When using `futureFlags.globalConfiguration`, `global.inputs` values are prepended to every task's inputs. If you want to exclude a global input from a specific task, you **must** include `$TURBO_DEFAULT$` to preserve default file hashing.

```json
// WRONG - task hashes NO files at all (global input cancelled, no defaults)
"build": {
  "inputs": ["!$TURBO_ROOT$/config.txt"]
}

// CORRECT - task hashes all package files, minus config.txt
"build": {
  "inputs": ["$TURBO_DEFAULT$", "!$TURBO_ROOT$/config.txt"]
}
```

Without `$TURBO_DEFAULT$`, the only inclusion glob comes from `global.inputs`, which the negation cancels out. The task ends up with no inclusions and no default file hashing, so it hashes nothing. Changes to source files won't cause cache misses.

## Caching Tasks with Side Effects

```json
// WRONG - deploy might be skipped on cache hit
"deploy": {
  "dependsOn": ["build"]
}

// CORRECT
"deploy": {
  "dependsOn": ["build"],
  "cache": false
}
```

Always disable cache for deploy, publish, or mutation tasks.

## `prebuild` Scripts That Manually Build Dependencies

Scripts like `prebuild` that manually build other packages bypass Turborepo's dependency graph.

```json
// WRONG - manually building dependencies
{
  "scripts": {
    "prebuild": "cd ../../packages/types && bun run build && cd ../utils && bun run build",
    "build": "next build"
  }
}
```

**However, the fix depends on whether workspace dependencies are declared:**

1. **If dependencies ARE declared** (e.g., `"@repo/types": "workspace:*"` in package.json), remove the `prebuild` script. Turbo's `dependsOn: ["^build"]` handles this automatically.

2. **If dependencies are NOT declared**, the `prebuild` exists because `^build` won't trigger without a dependency relationship. The fix is to:
   - Add the dependency to package.json: `"@repo/types": "workspace:*"`
   - Then remove the `prebuild` script

```json
// CORRECT - declare dependency, let turbo handle build order
// package.json
{
  "dependencies": {
    "@repo/types": "workspace:*",
    "@repo/utils": "workspace:*"
  },
  "scripts": {
    "build": "next build"
  }
}

// turbo.json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"]
    }
  }
}
```

**Key insight:** `^build` only runs build in packages listed as dependencies. No dependency declaration = no automatic build ordering.

## TypeScript Incremental Outputs

When `incremental: true` in tsconfig.json, `tsc --noEmit` writes `.tsbuildinfo` files even without emitting JS. Check the tsconfig before assuming no outputs:

```json
// If tsconfig has incremental: true, tsc --noEmit produces cache files
{
  "tasks": {
    "typecheck": {
      "outputs": ["node_modules/.cache/tsbuildinfo.json"] // or wherever tsBuildInfoFile points
    }
  }
}
```

To determine correct outputs for TypeScript tasks:

1. Check if `incremental` or `composite` is enabled in tsconfig
2. Check `tsBuildInfoFile` for custom cache location (default: alongside `outDir` or in project root)
3. If no incremental mode, `tsc --noEmit` produces no files
