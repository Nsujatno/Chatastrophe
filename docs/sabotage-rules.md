# M2 sabotage rules

`src/shared/rules.ts` is the shared admission schema and limit catalog.
`SabotageManager` validates, previews, queues, activates and clears definitions.
`ArenaScene` connects its world port to Phaser scene events, Arcade Physics,
existing Sprite atlases, warning art and ink bursts. Preset names and tags have
no behavior of their own. Nothing executes model/chat-provided code.

Briefings and previews translate the data into plain gameplay descriptions.
For example, attack interval ×0.7 reads as "shoot 43% faster", since firing speed
is the inverse of time between shots. Raw names and multipliers remain available
in the editor and optional inspector. Enemy bodies separate from each other,
while player/enemy contact remains an overlap that deals damage without blocking
movement. New and resized enemy bodies synchronize their previous-frame state
before post-update so a scheduled arrival cannot jump away from its marker.

Each wave can install one named ruleset, with up to six rules. Queue during wave
N for N+1, or before the first wave. Installation precedes the wave-start event.
Invalid replacements leave the valid queue intact. Queue and activation reject
stale run/wave ownership. With no queue the game continues normally.

## Catalog

| Piece | Values |
| --- | --- |
| Triggers | `enemy_died`, `enemy_spawned`, `player_damaged`, `wave_started`, `interval` with `everyMs` |
| Filters (AND) | `enemy_type` + `value`, `tag` + `value`, `chance` + `value`, `health_below` + `percent` |
| Actions | `spawn`, `explode`, `modify` |
| Placement | `at: { anchor: "event" / "player" / "arena", radius: 0..400 }` |
| Selectors | `{ kind: "player" }`, `{ kind: "event_entity" }`, `{ kind: "enemies", enemyType?, tag?, area?: { at, radius } }` |
| Archetypes | `hover-drone`, `skitter`, `hauler` |
| Player stats | `move_speed`, `projectile_damage`, `attack_interval` (lower is faster) |
| Enemy stats | `move_speed`, `contact_damage`, `size` |

`event` placement is available on death, spawn and damage events. A live
`event_entity` exists only on spawn and player damage. Incompatible stats,
filters, anchors and unknown fields fail validation. `health_below` uses the
current health percentage and a strict less-than comparison. Chance zero never
fires; one always passes. Enemy selectors choose current actors when firing;
enemy-spawn rules handle future arrivals.

## A custom combination

Paste this into the developer editor. It combines existing actions without
adding a handler: faster shots for the wave, plus some skitter deaths creating
warned blasts that can damage both sides.

```json
{
  "id": "unstable-yard",
  "name": "Unstable Yard",
  "rules": [
    {
      "id": "fast-shots",
      "trigger": { "type": "wave_started" },
      "actions": [
        { "type": "modify", "target": { "kind": "player" }, "stat": "attack_interval", "multiplier": 0.8, "durationMs": "wave" }
      ]
    },
    {
      "id": "skitter-blasts",
      "trigger": { "type": "enemy_died" },
      "filters": [
        { "type": "enemy_type", "value": "skitter" },
        { "type": "chance", "value": 0.5 }
      ],
      "cooldownMs": 1000,
      "actions": [
        { "type": "explode", "at": { "anchor": "event" }, "radius": 80, "damage": 10 }
      ]
    }
  ]
}
```

A spawn action adds `enemyType`, `count`, `at`, `profile`, and optional `tags`.
Profile multipliers are intrinsic spawn values: `health`, `speed`, `damage`,
`size`, `reward`. Unspecified profile values default to one, except sabotage
reward defaults to 0.5. Normal wave robots retain full rewards. The Chain
Reaction profile gives drones 0.5 health, 0.6 size, 0.5 damage and 0.25 rewards.

## Bounds and execution

All numeric inputs must be finite. Objects are strict, including nested data.

| Setting | Limit |
| --- | --- |
| Rules / actions per rule / filters per rule / tags per actor | 6 / 3 / 4 / 4 |
| IDs and tags | 1–32 lowercase letters, digits, `_`, `-`; initial letter |
| Name | 1–48 characters; displayed as text |
| Editor input | 32,000 characters |
| Interval / rule cooldown | 1,000–60,000ms / 0–60,000ms |
| Spawn count / offset / selection radius | 1–4 / 0–400px / 30–600px |
| Spawn health / speed / damage / size / reward multipliers | 0.25–3 / 0.5–1.5 / 0.25–2 / 0.4–1.5 / 0–1 |
| Explosion radius / damage | 30–120px / 1–30 |
| Modifier multiplier / duration | 0.5–2 / 250–15,000ms or `"wave"` |
| Combined contribution product | 0.25–3, then absolute stat bounds |
| Player speed / shot damage / attack interval | 100–460 / 3–180 / 100–1,200ms |
| Enemy speed / contact damage / size | 25–280 / 2–45 / 0.4–2 |
| Static chaos cost | ≤32 per ruleset; spawn = 3 × count, blast = 5, modifier = 1 |
| Active chaos cost | Same action costs; shared 32-token burst, 8 tokens/second refill |
| Actions per event / gameplay frame | 18 / 24, including due actions in the frame budget |
| Queued events / pending actions | 128 / 64 |
| Visible warnings / actors / shots / pickups / transient effects | 8 combined / 70 / 48 / 140 / 60 |
| Rule-created units per wave / enemy offspring generations / causal depth | 48 / 1 / 4 |

Rule cooldowns gate their complete action list; actions also share admission,
frame and token budgets. Excess work is denied, never granted input-provided
budgets. Reentrant events are queued and bounded. Missed interval ticks do not
catch up in a burst. Trusted code assigns IDs, owner, generation and causal depth.
Death snapshots survive destroyed Sprites, and an inactive actor cannot die twice.

Spawn and blast destinations are fixed when their 750ms warning is placed.
Rule placements keep an 80px arena margin and initially avoid player/actor overlap;
normal waves keep their 320px player exclusion. An announced arrival still occurs
if the player approaches. Shared caps can reject new work. Timer/player events
spawn roots; enemy events create children. Children can explode but cannot split
again, even if later killed by an unrelated projectile.

## Lifetime and progression

Modifiers are contributions keyed by owner/rule/action/entity/stat. Retriggering
refreshes the same contribution. Distinct contributions multiply within limits.
Effective stats are recalculated from permanent upgrades and intrinsic spawn
profiles; expiry never divides previously mutated values to undo an effect.

Gameplay time controls intervals, contribution expiry and warning delays. Pausing
freezes those clocks and physics. Wave end unsubscribes and cancels all hazards
before shutdown: surviving units, including children, pay half their profile's
reward. Minis pay 1 scrap in combat and 0.5 on shutdown; weak skitter reinforcements
pay 1.5 / 0.75. Manual clear removes owned units with no death event/reward, while
ordinary enemies stay. Death/restart also discard the next-wave queue. Clear does
not undo historical damage or resurrect enemies.

Waves last 30s, 45s, then 60s indefinitely. After wave three, spawn intervals drop
by 25ms/wave to a 220ms floor; health gains 0.12×/wave to 3×. Base type speeds and
contact damage stay fixed. Permanent caps are 120 damage, 150ms firing cooldown
and 360 movement speed. Shops fully heal, retain scrap/upgrades and allow one
purchase per break. Reading, editing and purchasing do not consume combat time.

M2 has manual development tools only. Real Twitch/AI collection belongs to M4/M5;
timed pre-wave voting remains M7.1. The production build hides the developer panel
and the test-only game reference.
