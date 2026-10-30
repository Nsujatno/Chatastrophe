# Chatastrophe — Agent Guidelines

## Project Context

Chatastrophe is a Twitch-integrated, browser-based arena survival game
inspired by Brotato and Vampire Survivors.

The streamer controls a character who fights waves of enemies, while
Twitch chat sabotages them through direct commands and AI-generated
gameplay rules.

The core flow is:

Streamer starts game → Survives waves → Chat triggers sabotage →
Chat suggests new mechanics → AI creates a validated custom rule →
Game changes dynamically → Streamer reacts and tries to survive.

Our main differentiator is not predefined Twitch commands.

It is the ability for the community to collaboratively invent new,
temporary gameplay behaviors through natural language.

The AI Game Director creates new rules by combining reusable,
predefined gameplay primitives.

We are not generating complete games or executing arbitrary
AI-generated code.

Read plan.md for project requirements, architecture, scope, milestones,
and acceptance criteria.

plan.md is the source of truth for what to build.

This file defines how to work.

## Engineering Principles

- YAGNI:
  Build only what's necessary for the current milestone.
  Avoid speculative systems, abstractions, and features.

- KISS:
  Prefer simple, readable implementations.
  Use small functions, clear names, and straightforward data flow.

- Delete aggressively:
  Remove unused code, dead files, stale comments, unnecessary
  dependencies, and superseded approaches.

- DRY, not prematurely:
  Remove real duplication, but don't create abstractions for
  hypothetical future needs.

- Reuse what exists:
  Follow established project patterns, use Phaser's built-in systems,
  and reuse working Twitch integration where practical.

- Ship vertical slices:
  Implement one complete, working feature before adding complexity.
  Prioritize P0 requirements over polish and stretch goals.

- Game feel matters:
  Prioritize responsive controls, reliable collisions, readable combat,
  and clear visual feedback over large amounts of content.

- Standalone first:
  The game must remain playable without Twitch, Socket.IO, or AI.
  External integrations enhance gameplay rather than define it.

- Keep gameplay systems modular:
  Separate player control, combat, enemy behavior, spawning, waves,
  sabotage, and dynamic rules into understandable components.

- One source of truth:
  All gameplay modifications should use shared sabotage and rule
  interfaces, regardless of whether they originate from debug controls,
  Twitch chat, or the AI Director.

- Data-driven creativity:
  Dynamic gameplay rules must be represented as validated data.
  The AI should compose supported triggers, conditions, and actions
  rather than generate executable code.

- Deterministic authority:
  The application decides whether a rule is valid and can execute.
  Never trust the LLM to enforce safety limits, cooldowns, or balance.

- Control complexity:
  Avoid creating a general-purpose programming language or large
  entity-component framework unless an actual requirement demands it.
  Build the smallest rule engine that supports our desired interactions.

- Handle temporary effects correctly:
  Every modifier must have reliable activation, expiration, cleanup,
  and reset behavior. Avoid permanent state corruption.

- Keep it safe:
  Treat Twitch chat and AI output as untrusted input.
  Validate schemas, enforce numeric bounds, prevent recursive loops,
  limit spawning, and keep secrets server-side.

- Respect Twitch:
  Use minimal OAuth scopes, secure token handling, supported EventSub
  mechanisms, and appropriate content filtering.

- No fake functionality:
  Use real Twitch events for production interactions.
  Clearly distinguish mock chat, fixtures, and demo simulations.

- Fail gracefully:
  Twitch disconnects and AI failures must not interrupt standalone
  gameplay. Reject invalid rules without crashing the game.

- Test what matters:
  Focus on gameplay logic, modifier cleanup, event routing, dynamic
  rule validation, security limits, and critical user flows.

- Validate changes:
  Run relevant TypeScript checks, tests, and browser checks after
  implementation. Fix failures rather than ignoring them.

- Optimize for the demo:
  Prioritize visually understandable mechanics, reliable operation,
  quick setup, and a memorable AI-generated sabotage moment.

- Leave it clean:
  Avoid placeholder implementations, unnecessary comments,
  unrelated refactors, and speculative dependencies.
  Update documentation when behavior changes.

## Working with Phaser

- Prefer Phaser's built-in Arcade Physics, animations, particles,
  camera, input, and sound systems over custom implementations.
- Consult installed Phaser AI Agent Skills when relevant.
- Keep game-specific logic separated from generic engine utilities.
- Use object pooling only when profiling or actual performance
  problems justify it.
- Clean up timers, event listeners, physics objects, and effects.
- Avoid introducing additional game engines or physics libraries.
- Preserve responsiveness and a stable gameplay loop.
- Do not trade working gameplay for unnecessary visual complexity.

## Working with Dynamic Rules

- Rule definitions must be JSON-compatible and schema-validated.
- All triggers, conditions, and actions must come from an explicit
  supported registry.
- No eval, arbitrary dynamic imports, or executable model output.
- Reject unknown actions and unsupported parameters.
- Enforce limits on spawning, execution frequency, and recursion.
- Keep generated rules temporary and reversible.
- Ensure event subscriptions are removed when rules expire.
- Test overlapping rules, restart behavior, and cleanup.
- Make AI-generated rules easy to inspect and debug.

The key design goal is to let chat invent surprising behaviors
without introducing unsafe or unpredictable execution.

## Working with AI

- Keep LLM calls outside the frame-by-frame gameplay loop.
- Process free-form suggestions asynchronously.
- Use structured outputs and runtime schema validation.
- Provide the model with only the relevant game state and
  supported rule catalog.
- Apply deterministic checks after every model response.
- Never expose API keys or internal prompts to Twitch chat.
- Do not let chat content override system instructions.
- Provide safe fallbacks for failed, invalid, or timed-out requests.
- Test both successful generation and safe rejection cases.
- Do not introduce AI where deterministic logic is sufficient.

## Milestone Workflow

1. Read AGENTS.md and plan.md.
2. Identify the current milestone and its acceptance criteria.
3. Inspect the relevant existing code before making changes.
4. Implement the smallest complete solution for that milestone.
5. Add or update tests for important behavior.
6. Run relevant checks.
7. Fix any failures.
8. Update milestone checkboxes only for verified completed work.
9. Stop before starting the next milestone unless explicitly asked.

Do not implement the entire roadmap in one pass.

Avoid unrelated refactors and changes outside the current milestone.

When a milestone is complete, briefly report:

- What works
- What changed
- What was tested
- What's blocked or incomplete
- What should be done next

Keep summaries concise and factual.