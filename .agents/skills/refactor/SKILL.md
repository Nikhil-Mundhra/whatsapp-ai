---
name: refactor
description: Surgical code refactoring to improve maintainability without changing external behavior. Covers extracting functions, renaming variables, breaking down god functions, improving type safety, eliminating code smells, and applying design patterns. Use for gradual improvements.
---

# Refactor

## Overview

Improve code structure and readability without changing external behavior. Refactoring is gradual evolution, not rewriting from scratch.

## When to Use

Use this skill when:
- Code is hard to understand or maintain
- Functions or classes are too large
- Code smells need addressing
- User explicitly requests "clean up this code", "refactor this", or "improve this structure"

---

## MANDATORY PREREQUISITE: Test Coverage Requirement

> [!CAUTION]
> **NO REFACTORING WITHOUT ADEQUATE TESTS.**
> Refactoring preserves existing external behavior. Without automated test coverage, changes cannot be safely validated.
>
> 1. **Check for Tests**: Before modifying any implementation code, verify that adequate automated unit/integration tests exist for the target functions or modules.
> 2. **Refusal Protocol**: If adequate tests do NOT exist, **the agent MUST refuse to execute the refactoring request**.
> 3. **Remediation**: Inform the user that adequate tests must be written first. Offer to write or expand the test suite before proceeding with any refactoring.

---

## Golden Rules of Refactoring

1. **Behavior Preservation** — Refactoring changes only code structure, never functional behavior.
2. **Mandatory Test Verification** — Run the test suite before starting, after every small incremental change, and upon completion.
3. **Small Steps** — Make tiny, localized changes; test after each step.
4. **Focused Scope** — Do not mix feature additions, bug fixes, or behavioral changes with refactoring.

---

## Safe Refactoring Workflow

1. **PREPARE & VERIFY TESTS**
   - Confirm test suite exists and is passing.
   - **Refuse to proceed if adequate tests are missing.**

2. **IDENTIFY & PLAN**
   - Identify specific code smells and target refactoring operations.
   - Plan minimal-impact structural changes.

3. **EXECUTE INCREMENTALLY**
   - Make one small change at a time.
   - Run unit/integration tests immediately after each edit.
   - Fix any breakage before moving to the next edit.

4. **VERIFY & CLEAN UP**
   - Ensure all automated tests pass with zero regressions.
   - Run type-checker and linters.
   - Clean up remaining dead code or obsolete comments.

---

## Index of Code Smells & Anti-Patterns

> **Need code examples & diffs?** Read [`references/code_smells_and_patterns.md`](./references/code_smells_and_patterns.md) for full before/after code snippets.

1. **Long Method/Function**: Function performing multiple duties. *Fix: Extract Method.*
2. **Duplicated Code**: Identical or near-identical logic repeated in multiple places. *Fix: Extract Function/Module.*
3. **Large Class/Module (God Object)**: Class/module managing too many unrelated responsibilities. *Fix: Single Responsibility Principle / Extract Class.*
4. **Long Parameter List**: Functions taking too many arguments. *Fix: Introduce Parameter Object / Options struct.*
5. **Feature Envy**: Method accessing another object's internal data more than its own. *Fix: Move Method to owner object.*
6. **Primitive Obsession**: Using raw primitives (strings, numbers) for rich domain concepts. *Fix: Value Objects / Enums.*
7. **Magic Numbers/Strings**: Hardcoded literal values without semantic naming. *Fix: Replace Magic Number with Constant.*
8. **Nested Conditionals (Arrow Anti-Pattern)**: Deeply nested `if/else` cascades. *Fix: Guard Clauses / Early Returns.*
9. **Dead Code**: Unused functions, parameters, or commented-out blocks. *Fix: Delete completely.*
10. **Inappropriate Intimacy**: Classes tightly coupling to each other's internal state. *Fix: Encapsulation / Law of Demeter.*

---

## Refactoring Operations & Design Patterns Index

| Operation / Pattern | When to Apply | Full Examples Link |
|---|---|---|
| **Extract Method / Function** | Break up long methods into focused single-purpose helpers | [View Diff](./references/code_smells_and_patterns.md#1-long-methodfunction) |
| **Extract Class / Module** | Split monolithic classes into single-responsibility services | [View Diff](./references/code_smells_and_patterns.md#3-large-classmodule) |
| **Introduce Parameter Object** | Combine 4+ parameters into a structured type | [View Diff](./references/code_smells_and_patterns.md#4-long-parameter-list) |
| **Guard Clauses / Early Returns** | Flatten nested conditional pyramids | [View Diff](./references/code_smells_and_patterns.md#8-nested-conditionals) |
| **Strategy Pattern** | Replace branching conditional logic with interchangeable strategies | [View Diff](./references/code_smells_and_patterns.md#strategy-pattern) |
| **Introduce Type Safety / Value Objects** | Replace raw strings/numbers with typed value wrappers | [View Diff](./references/code_smells_and_patterns.md#6-primitive-obsession) |
| **Inline Method / Class** | Remove unnecessary abstraction when logic is simple | [View Reference](./references/code_smells_and_patterns.md#common-refactoring-operations) |
| **Replace Conditional with Polymorphism** | Replace switch/if cascades with object dispatch | [View Reference](./references/code_smells_and_patterns.md#common-refactoring-operations) |

---

## Refactoring Checklist

- [ ] Automated tests cover the code under refactor and are passing
- [ ] Code smell identified and matched to target refactoring operation
- [ ] Functions are focused and do one thing well
- [ ] Duplicate code is eliminated
- [ ] Variable, function, and class names clearly convey intent
- [ ] Magic numbers and strings are replaced with named constants
- [ ] Unused (dead) code and obsolete comments are removed
- [ ] All tests and linters pass after refactoring

---

## Detailed References

For comprehensive examples of code smells, design patterns, and standard refactoring operations, open and read:
- [`references/code_smells_and_patterns.md`](./references/code_smells_and_patterns.md)
