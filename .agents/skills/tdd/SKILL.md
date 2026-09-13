---
name: tdd
description: Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests.
---

# Test-Driven Development

TDD uses a red → green → refactor loop to produce tests worth keeping. Consult the relevant guidance when selecting a test boundary or resolving uncertainty.

When domain terminology matters, consult `CONTEXT.md` if present and relevant ADRs so tests use the project's vocabulary.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification — "user can checkout with valid cart" tells you exactly what capability exists — and survives refactors because it doesn't care about internal structure.

Use [tests.md](tests.md) when assessing test quality and [mocking.md](mocking.md) when choosing mocking boundaries.

## Seams — where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

Infer test boundaries from existing public interfaces, package instructions, and the requested behavior. Ask only when an unresolved interface or behavior decision materially blocks implementation; continue independent work while awaiting an answer.

## Anti-patterns

- **Implementation-coupled** — mocks collaborators inside the chosen test boundary, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed. Repository-defined package boundaries remain valid mocking boundaries.
- **Tautological** — the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth — a known-good literal, a worked example, the spec.
- **Horizontal slicing** — writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead — one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.

## Rules of the loop

- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactor after green.** Perform small behavior-preserving refactors needed by the change, then rerun affected tests. Keep unrelated cleanup outside scope and follow the repository's pre-PR review process.
