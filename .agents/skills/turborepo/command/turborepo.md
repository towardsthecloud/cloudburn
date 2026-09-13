---
description: Configure or troubleshoot Turborepo task graphs, caching, filtering, and package build orchestration.
---

Load [the Turborepo skill](../SKILL.md) and apply it to $ARGUMENTS.
Choose the reference that addresses the task; read additional references only
when needed to resolve an uncertainty.

Package build and test tasks belong in their packages and use Turbo orchestration.
Root scripts for those tasks delegate to `turbo run`; repository-wide tooling and
wrappers may run directly from the root. A registered Root Task must not invoke
Turbo recursively.

Check the configuration affected by the change: declared dependencies and
`dependsOn`, outputs for files actually produced, and environment/input hashing
where relevant. Follow repository validation instructions and report the outcome.

<user-request>
$ARGUMENTS
</user-request>
