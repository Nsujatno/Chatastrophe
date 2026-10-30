# Scavenger directional animation

Generated 2026-10-30 with the built-in image-generation tool, using the original
`public/assets/scavenger.png` as the character and style reference.

Saved to `public/assets/scavenger-walk.png` with its original alpha transparency.
The generated sheet is 1254 × 1254. `public/assets/scavenger-walk.json` defines
16 trimmed atlas frames aligned on a common 320 × 320 canvas; source pixels
are unchanged. Idle cycles use neutral poses 0 and 2. The left walk uses
poses 0, 1, 2, 1 to preserve its facing direction throughout the loop.

## Exact generation prompt

```text
Create a production sprite sheet for the EXACT yellow scavenger robot in the reference image, preserving its identity and the simple bold hand-drawn paper-and-ink cartoon style.
OUTPUT: one square 1024 by 1024 PNG, genuine transparent alpha background. EXACT regular 4 column by 4 row grid, 16 equally sized 256 by 256 cells, zero spacing, zero border, zero labels. Each cell contains ONE complete robot, centered consistently, same scale in every frame, with generous transparent margin (robot fits inside central 180 by 190 pixels). Do not draw the grid.
ROW ORDER top to bottom:
Row 1: facing DOWN toward the viewer, four successive walk poses.
Row 2: facing LEFT, four successive walk poses.
Row 3: facing RIGHT, four successive walk poses.
Row 4: facing UP away from viewer, four successive walk poses.
COLUMN ORDER each row: neutral planted stance, left-foot-forward stride, neutral stance, right-foot-forward stride. Stubby feet and little claw arms change pose visibly; slight head bob, expressive bent antenna follows motion. Each row must keep a consistent body center and scale. Frame zero in each row doubles as a standing idle pose.
The reference is STYLE AND CHARACTER IDENTITY, not a sheet to repeat unchanged. Actually DRAW walking limb poses and corresponding side and back views.
Subject: mustard-yellow oversized rounded-square shell/head, one large off-white round optic with charcoal pupil on its FRONT (visible in down and side views; back view has plain yellow back panel with two tiny scratches), tiny dark body, two stubby legs, two short claw arms, bent antenna.
Camera: same top-down overhead camera as reference, primarily top of head and shoulders, compact foreshortened body. Very bold slightly uneven charcoal contours, flat yellow and gray fills, no fine machinery or surface noise. Crisp silhouettes readable at 76 gameplay pixels.
No text, numbers, floor, shadows, glow, gradients, extra characters, weapons, overlapping cells, contact-sheet decorations, perspective camera changes, or cropped antennae. Preserve transparent gaps around every sprite.
```
