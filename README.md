# Chatastrophe

A top-down arena survival game in a paper-and-ink robot world. The planned game
lets Twitch chat sabotage the streamer through validated temporary rules.

**Current slice: M0 visual preview.** The page displays a yellow scavenger robot,
two static enemy designs, and an overgrown industrial clearing. Field notes can
be hidden, idle motion paused, and the scene reset. This is not playable combat.

## Setup

Requires Node.js 22.12+ (Node 24 recommended) and npm. All installs are chosen and
run by the project owner. The dependency manifest and lockfile record the selected
versions, including Vitest 5.

For a fresh checkout, install the locked dependencies:

```sh
npm ci
```

If Chromium has not already been installed for this Playwright version, the
browser smoke tests also need this one-time browser download:

```sh
npx playwright install chromium
```

Alternatively, use an already installed Chrome without a browser download
(PowerShell):

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm run test:e2e
```

Unset `PLAYWRIGHT_CHANNEL` to return to Playwright's bundled Chromium.

No API keys, backend, external fonts, Twitch account, or AI connection are needed.
All preview images are served locally.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server at http://127.0.0.1:5173 |
| `npm run typecheck` | TypeScript checks |
| `npm run lint` | ESLint |
| `npm test` | Vitest asset-integrity checks |
| `npm run test:watch` | Watch unit tests |
| `npm run test:e2e` | Chromium smoke tests; starts a server on port 4173 |
| `npm run build` | Typecheck and create production output in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run check` | Run all checks, build, and browser tests |

## Structure

```text
src/main.ts                    Phaser lifecycle and Vite hot-reload cleanup
src/game/config.ts             Phaser FIT scaling and zero-gravity Arcade setup
src/game/settings.ts           Logical viewport, arena bounds, shared colors
src/game/assets.ts             Asset filenames and silhouette bounds
src/game/scenes/PreviewScene.ts Asset loading, preview composition, controls
src/style.css                  Paper interface around the canvas
public/assets/                 Custom illustrated PNGs
tests/unit/                    Asset file and silhouette-bound integrity
tests/browser/                 Startup, resize, reset, motion, failure smoke tests
docs/art-prompts.md             Asset provenance and exact generation prompts
```

Phaser owns the frame loop, rendering, texture loading, camera, tween, and physics
systems. HTML handles the accessible preview controls; scene shutdown removes
their listeners. No gameplay framework, server scaffolding, or unused milestone
directories have been added.

The 1280 × 720 viewport stays fixed while its display scales to its parent. The
1600 × 900 arena is currently viewed from the center. M1 will add movement and
camera follow within those bounds. Scenery is decorative until gameplay collision
data is implemented.

## Design and scope

See [UI.md](UI.md) for the agreed visual rules, [PLAN.md](PLAN.md) for milestone
requirements, and [AGENTS.md](AGENTS.md) for engineering guidelines.

Phaser installation reference: [official Phaser guide](https://phaser.io/oss/docs/phaser/getting-started/installation).

M0 checks must pass before its checkboxes are marked complete. The next gameplay
slice is M1.1: responsive, normalized player movement and a bounded follow camera.

The M0 idle is vertical motion. During Chromium verification, rotating the small
player image showed clipping in the WebGL multi-texture path. The vertical idle
renders correctly; recheck sprite rotation visually before introducing it in M1.
