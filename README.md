# Chatastrophe

A standalone top-down arena survival game in a paper-and-ink robot world.
Guide a yellow scavenger through three waves of rogue machines, collect scrap,
and fit an upgrade between waves.

**Current milestone: M1 — standalone survival.** Twitch, sabotage, and the AI
Director belong to later milestones. The game needs no account, API key, backend,
or external connection; all artwork is served locally.

## Play

- Select **Enter the yard**.
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
- **Restart run** and **Try again** begin at wave one with every run value reset.

| Wave | Timer | Enemies |
| --- | --- | --- |
| 1 | 30 seconds | Hover drones |
| 2 | 45 seconds | Drones and fast skitters |
| 3 | 60 seconds | Drones, skitters, and heavy haulers |

Surviving wave three wins. Reaching zero health loses the whole run.

The shop offers +6 damage, a 25% shorter attack cooldown, or 15% faster movement.
Upgrades cost 60 scrap after wave one and 90 after wave two. Purchased upgrades
and unspent scrap carry through the run.

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
src/game/scenes/ArenaScene.ts  Combat, spawning, transitions, and lifecycle cleanup
src/game/ui/GameUI.ts          Accessible HTML HUD and menus
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
48 projectiles, 140 scrap pickups, eight spawn warnings, and 60 transient effects.
At the pickup cap, earned scrap is credited directly rather than discarded.
Player and enemy illustrations retain their source alpha; their atlases align
directional animation frames without modifying generated pixels. Drone thrusters,
skitter legs, and hauler treads/claws have distinct movement cycles. Hauler arms
turn with its chassis, and the visor appears only on its facing edge. Animation
changes preserve the established collision circles and combat/economy values.

Unit tests cover wave transitions, invulnerability, payout values, upgrade limits,
invalid inputs, normalized movement, targeting, spawn safety, and atlas geometry.
Browser checks cover actual collisions, movement, animation playback, pickups,
warnings, shops, win/loss, pauses, responsive layout, and repeated clean restarts.

Browser tests serve Vite in `test` mode, which exposes a test-only game reference.
Transition fixtures explicitly advance the run clock; a separate full-run test
simulates all 135 seconds at 60 physics steps per second with normal health,
spawning, damage, keyboard states, and earned upgrades. Production builds omit
the test reference.

See [plan.md](plan.md) for milestones, [UI.md](UI.md) for visual direction, and
[AGENTS.md](AGENTS.md) for engineering guidelines. Animation, Sprite, physics,
input, camera, loading, scene, event, timer, tween, and graphics decisions follow
the installed Phaser skills.

Audio remains disabled for M1. The production build retains the known non-blocking
Phaser bundle-size warning. Weapon variety, sabotage, Twitch, and AI remain future
work.
