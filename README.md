# Chatastrophe

A standalone top-down arena survival game in a paper-and-ink robot world.
Guide a yellow scavenger through endless waves of rogue machines, collect scrap,
and fit an upgrade between waves.

**Current milestone: M2 — endless waves and composable sabotage.** Six example
rulesets and custom JSON use one validated, wave-scoped runtime. Twitch and the AI
Director belong to later milestones. The game needs no account, API key, backend,
or external connection; all artwork is served locally.

The developer build includes a clearly labeled manual sabotage queue. Timed
pre-wave chat voting is deferred to M7.1; there is no simulated Twitch/AI input.

## Play

- Select **Start run**.
- The side HUD shows the wave, health beside a red heart, time remaining,
  scrap beside its pickup icon, and defeated robots.
- Move with **WASD** or **arrow keys**. Movement starts and stops immediately;
  diagonals have the same speed as cardinal movement.
- The scavenger automatically fires straight projectiles at the nearest enemy
  within range. Shots stop at the first enemy they hit.
- Dodge contact damage. Enemies can be passed through; taking a hit grants one
  second of invulnerability.
- Collect scrap by moving near it. Warning markers are placed away from the
  player. Once announced, robots appear there even if the player moves closer.
- Survive the timer. Remaining robots shut down for half their normal scrap
  payout, and all uncollected scrap is banked.
- Health fully refills between waves. Buy at most **one upgrade per break** or
  save the scrap and start the next wave.
- **Escape** or **Pause** pauses the run. Losing focus also pauses it; resume
  explicitly when ready.
- The **fullscreen icon** expands the game, health display and controls to fill
  the screen. Select it again or use the browser's Escape behavior to return.
  Toolbar icons have tooltips and accessible labels for pause, restart and fullscreen.
- Robots bump into each other instead of stacking. The player can still move
  through them and take contact damage.
- **Restart run** and **Try again** begin at wave one with every run value reset.

| Wave | Timer | Enemies |
| --- | --- | --- |
| 1 | 30 seconds | Hover drones |
| 2 | 45 seconds | Drones and fast skitters |
| 3 | 60 seconds | Drones, skitters, and heavy haulers |
| 4+ | 60 seconds | Same types, increasing bounded spawn pressure and health |

Keep surviving until health reaches zero. There is no final wave.

The shop offers +6 damage, a 25% shorter attack cooldown, or 15% faster movement.
Upgrades cost 60 scrap after wave one, increasing by 30 each wave. Purchased
upgrades and unspent scrap carry through the run. Permanent caps are 120 shot
damage, a 150ms attack cooldown, and 360 movement speed; maxed choices cost nothing.

## Try sabotage

Run the development server and expand **Test modifiers · presets and custom rules**
below the arena. Load **Chain Reaction**, **Panic Mode**, **Heavy Metal**,
**Reactor Pulses**, **Distress Signal**, or **Glass Cannon**, then select
**Use next wave**. A preset loads editable data; loading alone does not queue it.

Queue before entering the yard for wave one, or during a wave for the next one.
The safe break shows the name and actual changes before you start. Each ruleset
expires before that wave's shutdown payout. **Check rules** also accepts
entirely new combinations of supported primitives. Invalid edits preserve the
last valid queue. Editing pauses combat and releases keyboard capture; resume
explicitly afterward.

Use **Finish this wave** for normal settlement, **Stop current changes** to restore
stats/remove owned units without rewards, and **Remove next-wave changes** to empty
the next-wave slot. Active data, queued data, warnings, subscriptions and modifiers
are inspectable in the panel. Production builds omit the panel and test bridge.
See [the rule format and limits](docs/sabotage-rules.md) for a custom example.

Descriptions use gameplay language. Glass Cannon means **43% faster firing**
(450ms between shots becomes 315ms) in exchange for **40% more damage from enemy
hits**. Technical rule data stays in the custom editor and optional inspector.
Reinforcements arrive at the warning's exact position, including their first frame.

## Setup

Requires Node.js 22.12+ (Node 24 recommended) and npm. Dependency versions are
recorded in the manifest and lockfile. For a fresh checkout:

```sh
npm ci
npm run dev
```

Open the local address printed by Vite, normally http://127.0.0.1:5173.

Playwright requires its Chromium browser:

```sh
npx playwright install chromium
```

An installed Chrome can also be used without downloading another browser
(PowerShell):

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm run test:e2e
```

Unset `PLAYWRIGHT_CHANNEL` to return to bundled Chromium.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run typecheck` | TypeScript checks |
| `npm run lint` | ESLint |
| `npm test` | Gameplay rules and asset-integrity tests |
| `npm run test:watch` | Watch unit tests |
| `npm run test:e2e` | Chromium gameplay and browser checks |
| `npm run test:production` | Chromium production checks; run build first |
| `npm run build` | Typecheck and build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run check` | All checks, production build, and browser tests |

## Structure

```text
src/main.ts                    Game lifecycle and Vite hot-reload cleanup
src/game/config.ts             Phaser FIT scaling and zero-gravity Arcade setup
src/game/assets.ts             Illustrated asset filenames and silhouette bounds
src/game/entities/             Player, enemy, projectile, and scrap physics objects
src/game/systems/run.ts        Wave, health, economy, upgrades, limits, and tuning
src/game/events/gameEvents.ts  Enemy death event payload and name
src/shared/rules.ts           Strict schemas, primitive catalog and safety limits
src/game/rules/               Data presets, modifier contributions and coordinator
src/game/scenes/ArenaScene.ts  Combat, spawning, transitions, and lifecycle cleanup
src/game/ui/GameUI.ts          Accessible HTML HUD and menus
src/game/ui/DebugUI.ts         Development-only editor, queue and runtime inspection
public/assets/                Local illustrations, directional actor atlases, icons
tests/unit/                   Gameplay rules and artwork integrity
tests/browser/                Actual Phaser gameplay and UI verification
docs/art-prompts.md            Artwork provenance
docs/scavenger-animation.md   Exact player animation prompt and atlas details
docs/enemy-and-gameplay-art.md Enemy/icon prompts and orientation requirements
```

The game uses Phaser Arcade Physics overlaps, bounded camera following, Sprite
frame animations for all actors, custom projectile/pickup/warning PNGs, and timers and
tweens. HTML handles the HUD and keyboard-accessible menus. Scene shutdown removes
external listeners, timers, tweens, and physics objects; restarting recreates run
state. No pooling framework or additional engine has been introduced.

The logical viewport is **1280 × 720**, displayed proportionally using FIT. The
bounded arena is **1600 × 900**. Background debris is decorative. Portrait windows
keep the full canvas and move menus beneath it; keyboard play is desktop first.

## Tuning and verification

Gameplay values live in `src/game/systems/run.ts`. Active caps are 70 enemies,
48 projectiles, 140 scrap pickups, eight combined hazard warnings, and 60 transient effects.
At the pickup cap, earned scrap is credited directly rather than discarded.
Player and enemy illustrations retain their source alpha; their atlases align
directional animation frames without modifying generated pixels. Drone thrusters,
skitter legs, and hauler treads/claws have distinct movement cycles. Hauler arms
turn with its chassis, and the visor appears only on its facing edge. Animation
changes preserve the established collision circles and combat/economy values.

Unit tests cover wave transitions, invulnerability, payout values, upgrade limits,
invalid inputs, normalized movement, targeting, spawn safety, and atlas geometry.
Browser checks cover actual collisions, movement, animation playback, pickups,
warnings, shops, loss, pauses, responsive layout, and repeated clean restarts.
Rule tests cover validation, ownership, every primitive, refresh/stacking/expiry,
lineage, warning delays, chained explosions, bounded execution and all six presets.

Browser tests serve Vite in `test` mode, which exposes a test-only game reference.
Transition fixtures explicitly advance the run clock; a separate full-run test
simulates 195 seconds across four waves at 60 physics steps per second with normal health,
spawning, damage, keyboard states, and earned upgrades. Production builds omit
the test reference.

See [plan.md](plan.md) for milestones, [UI.md](UI.md) for visual direction, and
[AGENTS.md](AGENTS.md) for engineering guidelines. Animation, Sprite, physics,
input, camera, loading, scene, event, timer, tween, and graphics decisions follow
the installed Phaser skills.

Audio remains disabled. Production builds report non-blocking Phaser bundle-size
and upstream Zod comment-annotation warnings. M3 is rule-engine hardening; weapon
variety, Twitch, AI, and timed chat voting remain future work.
