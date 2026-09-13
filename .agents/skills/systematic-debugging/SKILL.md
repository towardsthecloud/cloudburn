---
name: systematic-debugging
description: Four-phase debugging workflow. Use when explicitly requested as an alternative to the default diagnosing-bugs workflow.
---

# Systematic Debugging

## Overview

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

**Core principle:** Investigate the root cause before attempting fixes.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

Base fixes on evidence. When a runnable reproduction is unavailable, continue read-only tracing, label hypotheses, and ask for missing access or evidence while pursuing independent investigation. Report verification limits.

## When to Use

Use `diagnosing-bugs` by default for hard bugs, regressions, flaky failures, and performance problems when available. Use this workflow instead when explicitly requested; do not stack both debugging procedures. For routine issues, trace the cause and use the repository's appropriate checks.

## The Four Phases

Use the phases to organize the investigation. Reuse evidence already established and revisit a phase when new evidence changes the diagnosis.

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. **Read Error Messages Carefully**
   - Don't skip past errors or warnings
   - They often contain the exact solution
   - Read stack traces completely
   - Note line numbers, file paths, error codes

2. **Reproduce Consistently**
   - Can you trigger it reliably?
   - What are the exact steps?
   - Does it happen every time?
   - If not reproducible → gather more data, don't guess

3. **Check Recent Changes**
   - What changed that could cause this?
   - Git diff, recent commits
   - New dependencies, config changes
   - Environmental differences

4. **Gather Evidence in Multi-Component Systems**

   **WHEN system has multiple components (CI → build → signing, API → service → database):**

   **Use existing evidence first. Add targeted, temporary diagnostics only where needed:**
   ```
   At boundaries that distinguish the current hypotheses:
     - Inspect relevant inputs, outputs, and state
     - Verify environment/config propagation without printing sensitive values
     - Redact secrets and sensitive payloads from captured evidence

   Run once to gather evidence showing WHERE it breaks
   THEN analyze evidence to identify failing component
   THEN investigate that specific component
   ```

   Remove temporary diagnostics after the investigation. Production instrumentation still requires authorization.

   **Example (presence-only environment check):**
   ```bash
   if [ -n "${IDENTITY:-}" ]; then
     printf '%s\n' 'IDENTITY: SET'
   else
     printf '%s\n' 'IDENTITY: UNSET OR EMPTY'
   fi
   ```

5. **Trace Data Flow**

   **WHEN error is deep in call stack:**

   See `root-cause-tracing.md` in this directory for the complete backward tracing technique.

   **Quick version:**
   - Where does bad value originate?
   - What called this with bad value?
   - Keep tracing up until you find the source
   - Fix at source, not at symptom

### Phase 2: Pattern Analysis

**Find the pattern before fixing:**

1. **Find Working Examples**
   - Locate similar working code in same codebase
   - What works that's similar to what's broken?

2. **Compare Against References**
   - Read the relevant reference implementation and trace its dependencies
   - Expand reading when a contract or assumption remains unclear

3. **Identify Differences**
   - What's different between working and broken?
   - Compare differences that could explain the symptom; broaden if the evidence rules them out

4. **Understand Dependencies**
   - What other components does this need?
   - What settings, config, environment?
   - What assumptions does it make?

### Phase 3: Hypothesis and Testing

**Scientific method:**

1. **Form Single Hypothesis**
   - State clearly: "I think X is the root cause because Y"
   - Write it down
   - Be specific, not vague

2. **Test Minimally**
   - Make the SMALLEST possible change to test hypothesis
   - One variable at a time
   - Don't fix multiple things at once

3. **Verify Before Continuing**
   - Did it work? Yes → Phase 4
   - Didn't work? Form NEW hypothesis
   - DON'T add more fixes on top

4. **When You Don't Know**
   - Say "I don't understand X"
   - Don't pretend to know
   - Research the uncertainty; ask for missing evidence or decisions that materially block progress
   - Continue independent investigation while awaiting an answer

### Phase 4: Implementation

**Fix the root cause, not the symptom:**

1. **Create Failing Test Case**
   - Simplest possible reproduction
   - Automated test if possible
   - One-off test script if no framework
   - For substantial behavior changes and meaningful regression cases, create it before fixing
   - For smaller corrections, use appropriate existing checks instead of tests that merely mirror the implementation
   - Use the `tdd` skill when the change calls for test-first development

2. **Implement Single Fix**
   - Address the root cause identified
   - ONE change at a time
   - No "while I'm here" improvements
   - Keep unrelated refactoring outside scope; perform needed behavior-preserving cleanup after the fix passes

3. **Verify Fix**
   - Test passes now?
   - No other tests broken?
   - Issue actually resolved?

4. **If Fix Doesn't Work**
   - Re-analyze the evidence before another fix
   - After repeated failed fixes, reassess the hypotheses and architecture (step 5 below)
   - Continue bounded investigation; an attempt count alone is not an approval gate

5. **After Repeated Failed Fixes: Reassess Architecture**

   **Pattern indicating architectural problem:**
   - Each fix reveals new shared state/coupling/problem in different place
   - Fixes require "massive refactoring" to implement
   - Each fix creates new symptoms elsewhere

   **STOP and question fundamentals:**
   - Is this pattern fundamentally sound?
   - Are we "sticking with it through sheer inertia"?
   - Should we refactor architecture vs. continue fixing symptoms?

   Ask before proceeding when the next step requires an unresolved product decision, consequential redesign, or additional authorization. Continue independent investigation while awaiting an answer.

   Repeated failures are evidence to reassess the approach, not proof that the architecture is wrong.

## Red Flags - STOP and Follow Process

If you catch yourself thinking:
- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "Skip the relevant verification"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- "Pattern says X but I'll adapt it differently"
- "Here are the main problems: [lists fixes without investigation]"
- Proposing solutions before tracing data flow
- **Repeating a failed fix without new evidence**
- **Each fix reveals new problem in different place**

**ALL of these mean: STOP. Return to Phase 1.**

**After repeated failed fixes:** Reassess the architecture and evidence (see Phase 4.5).

## your human partner's Signals You're Doing It Wrong

**Watch for these redirections:**
- "Is that not happening?" - You assumed without verifying
- "Will it show us...?" - You should have added evidence gathering
- "Stop guessing" - You're proposing fixes without understanding
- "Ultra-think this" - Question fundamentals, not just symptoms
- "We're stuck?" (frustrated) - Your approach isn't working

**When you see these:** STOP. Return to Phase 1.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Issue is simple, no investigation needed" | Trace the cause and verify the correction; scale the process to the uncertainty. |
| "Emergency, no time for process" | Systematic debugging is FASTER than guess-and-check thrashing. |
| "Just try this first, then investigate" | First fix sets the pattern. Do it right from the start. |
| "Skip the regression test for a substantial fix" | Capture meaningful regression cases before fixing; use appropriate existing checks for smaller corrections. |
| "Multiple fixes at once saves time" | Can't isolate what worked. Causes new bugs. |
| "Reference too long, I'll assume the contract" | Read the relevant implementation and dependencies until the contract is clear. |
| "I see the problem, let me fix it" | Seeing symptoms ≠ understanding root cause. |
| "Repeat the same failed approach" | Reassess the evidence and architecture before another bounded fix. |

## Quick Reference

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| **1. Root Cause** | Read errors, reproduce, check changes, gather evidence | Understand WHAT and WHY |
| **2. Pattern** | Find working examples, compare | Identify differences |
| **3. Hypothesis** | Form theory, test minimally | Confirmed or new hypothesis |
| **4. Implementation** | Create test, fix, verify | Bug resolved, tests pass |

## When Process Reveals "No Root Cause"

If systematic investigation reveals issue is truly environmental, timing-dependent, or external:

1. You've completed the process
2. Document what you investigated
3. Implement appropriate handling (retry, timeout, error message)
4. Propose additional monitoring only if evidence is still missing; production instrumentation requires authorization

**But:** 95% of "no root cause" cases are incomplete investigation.

## Supporting Techniques

These techniques are part of systematic debugging and available in this directory:

- **`root-cause-tracing.md`** - Trace bugs backward through call stack to find original trigger
- **`defense-in-depth.md`** - Select validation boundaries when invalid data can reach the failure through independent entry points
- **`condition-based-waiting.md`** - Replace arbitrary timeouts with condition polling

**Related skills:**
- **tdd** - For substantial behavior changes and meaningful regression tests (Phase 4, Step 1)
- Follow the repository's validation and pre-PR review instructions. Report fresh evidence and any remaining limits; do not repeat included checks on unchanged inputs without a new failure or concern.

## Real-World Impact

From debugging sessions:
- Systematic approach: 15-30 minutes to fix
- Random fixes approach: 2-3 hours of thrashing
- First-time fix rate: 95% vs 40%
- New bugs introduced: Near zero vs common
