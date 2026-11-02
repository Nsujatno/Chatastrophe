# Rule integration contract (M3)

The game has one interpreter: `SabotageManager`. Presets, custom JSON and future
Twitch/AI adapters submit the same data to it. The new examples in `docs/rules/`
need no new action handler, actor class or named gameplay branch.

## Catalog and validation

Import `getRuleCatalog`, `parseRuleset` and `validateRuleset` from
`src/shared/rules.ts`. The module works in Node and the browser without Phaser,
DOM or server dependencies. `getRuleCatalog()` returns independent JSON data:

- A versioned JSON Schema generated from the actual Zod input schema, including
  defaults, strict objects, registered pieces and parameter bounds.
- Trigger context (enemy, position, live entity), filters, selectors, anchors,
  enemy types, permitted target stats and their absolute bounds.
- Action costs, event/frame/queue/spawn budgets and native entity/warning caps.
- Lifecycle semantics and the checks that require runtime validation.

`docs/rule-catalog.json` is the generated export for JSON consumers. Regenerate it
with `npm run rules:catalog`; a test detects stale exports. Do not edit it directly.
The command uses Node's built-in TypeScript stripping and needs no bundler,
browser, API key or extra dependency.

JSON Schema describes structure, not complete execution approval. Unique rule
IDs/tags, compatible contexts/stats and combined chaos cost still require
`validateRuleset` through the shared queue interface. These additional checks are
listed in `runtimeChecks`; context/stat compatibility is described in the catalog.

Use `parseRuleset(text)` for raw responses. It rejects non-text input, malformed
JSON and responses over 32,000 characters before parsing. Use
`validateRuleset(data)` for already parsed JSON. Oversized rules/actions/filters/
tags are rejected before walking their entries. Both return either `{ ok: true,
data }` (canonical data with defaults) or `{ ok: false, errors }`. Neither executes
supplied content. Unknown fields and unsupported pieces are rejected. Future
server adapters must also enforce body limits and authentication; executable
JavaScript objects are not a transport format.

## Asynchronous callers and authority

Capture the intended run and next wave when starting a request. Pass that same
target on completion; never retarget a late answer to a later wave.

```ts
const manager = currentManager();
const target = { runId: manager.runId, wave: manager.wave + 1 };
const responseText = await requestSuggestion(getRuleCatalog());
if (manager !== currentManager()) return;
const result = parseRuleset(responseText);
if (!result.ok) return showErrors(result.errors);
if (!manager.queue(result.data, target)) showErrors(manager.errors);
```

This describes a future adapter; M3 makes no Twitch or AI calls. The application
owns authenticated source/session identity, run/wave/entity IDs, lineage, causal
depth, clocks and budgets. These are not valid rule JSON properties. Never
dispatch model-provided gameplay events or trust its own safety scores.

`queue` replaces one next-wave slot only after complete admission. Invalid/stale
replacements preserve the valid queue. `beginWave` accepts the next sequential
wave once; the host installs it before `wave_started`. Death/restart permanently
close that manager, reject late results and discard queued changes. A new run
gets a new manager and run ID.

## Events, time and cleanup

The Phaser adapter calls `beginFrame()` in `PRE_UPDATE`, before Arcade collisions
emit events. `tick(deltaMs)` advances rule time during scene update without
granting a second budget. A non-Phaser host may use `tick` alone for one logical
frame, or `beginFrame` before its physics/event phase. External suggestion
callbacks must not control the clock. Paused gameplay does not tick it.

Processed event work and queued events are both bounded at 128. Limits are 18
actions per event and 24 per frame, including due delayed work. A 32-token pool
refills eight per gameplay second: spawn costs three per unit, explosions five,
and modifiers one. Scheduling reserves tokens; delivery also uses the frame-work
budget. Excess work can be denied. Intervals skip missed repetitions rather than
catching up in a burst.

Each installation owns its callbacks, clocks, contributions and scheduled work.
Detached old callbacks cannot execute a new installation, even with fresh wave
metadata. Delivery checks ownership too. Invalid causal depth/positions are
ignored; invalid generations cannot escape the offspring limit. Typed events
come from the game, never external services. Deaths carry destroyed-subject
snapshots; live selectors recheck current actors. Shutdown deaths trigger no
rules. Children may explode but cannot make grandchildren. Warning locations
are fixed when scheduled.

Contributions use owner/rule/action/entity/stat identity. Retriggering refreshes;
distinct contributions multiply under bounds. Removing contributions recalculates
from permanent upgrades and intrinsic profiles instead of dividing mutated stats.
Short effects are clamped to their wave. Wave end cancels subscriptions, hazards
and contributions before normal half-value settlement. Manual clear removes
owned actors without death/reward events. Historical damage, earned scrap and
defeated actors are not reversed. Numeric details are in `sabotage-rules.md`.

## Examples and catalog gap decision

Load a file into the custom editor and select **Use next wave**:

| File | Behavior |
| --- | --- |
| `docs/rules/rescue-party.json` | Below half health, periodic weak tagged drones arrive; arrivals are slowed/enlarged, and their deaths create warned blasts. |
| `docs/rules/volatile-haulers.json` | Some hauler deaths explode and briefly speed up nearby robots, with a cooldown. |
| `docs/rules/last-stand.json` | Damage at low health boosts shots and summons a pursuer; its death creates one child that later explodes. |

These exercise conditional intervals, chance, tags, multiple actions, spatial
selection, current/future actors, player modifiers and linked root/child effects.
All fit the existing catalog: M3 needs no new primitives. Projectile-hit triggers,
distance predicates, projectile patterns, lasting area hazards and knockback
remain unsupported candidates. Requests for them fail admission instead of partly
executing; add one only for an agreed concrete use.

Verification combines pure rule/progression simulations with real Phaser tests.
The 250-wave simulation covers 14,955 seconds (over four hours) with 70 actors,
event floods and permanent upgrades. The native capacity test explicitly uses
funded purchases and temporary invulnerability as fixtures to inspect 20 dense
waves and repeated restarts; it is not a balance/survival claim. The separate
four-wave, 195-second run uses normal health and earned upgrades. New-composition
browser cases use native warnings, Sprites, damage, expiry and settlement.

Twitch transport/authentication, source rate limits, model calls and content
filtering remain M4/M5 integration work. Timed pre-wave voting is M7.1.
