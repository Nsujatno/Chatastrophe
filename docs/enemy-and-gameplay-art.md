# Enemy animations and gameplay artwork

Generated 2026-10-30 with the built-in image-generation tool, using the existing
robot PNGs as character/style references. Every selected PNG retains genuine
alpha transparency. Raster pixels are unchanged; JSON atlas metadata trims and
centers the animation frames.

## Selected files

| Asset | PNG | Atlas / use |
| --- | --- | --- |
| Hover drone | `public/assets/hover-drone-move.png` | `hover-drone-move.json`, four directions × four hover phases |
| Skitter | `public/assets/skitter-move.png` | `skitter-move.json`, four directions × four leg phases |
| Hauler | `public/assets/hauler-move.png` | `hauler-move.json`, four directions × four tread/claw phases |
| Scrap | `public/assets/scrap.png` | Salvage nut, 20 logical pixels wide |
| Projectile | `public/assets/bolt.png` | Radial energy pellet, 14 logical pixels wide |
| Spawn warning | `public/assets/spawn-warning.png` | Warning ring and exclamation mark, 64 logical pixels wide |

The three enemy sheets are 1254 × 1254. Each uses 16 aligned frames on a common
322 × 322 logical source canvas. Frame rectangles include a two-pixel margin
around alpha ≥ 128 bounds, limited to the original cell. The original reference
PNGs remain available for provenance and future artwork edits; gameplay loads
the new atlases instead.

Movement uses Phaser Arcade Sprites. Drone animation runs at 5 fps, skitter at
12 fps, and hauler at 6 fps. Direction follows the dominant movement axis.
Physics circles retain the established radii: drone 20, skitter 22, hauler 38.
Scrap and projectile circles remain 6 and 5 logical pixels respectively.
Animation playback pauses/resumes with the run and stops on defeat.

Hauler orientation was corrected at the owner's request:

| Moving | Visor edge | Large claw | Piston |
| --- | --- | --- | --- |
| Down | Bottom | Left | Right |
| Left | Left only | Above | Below |
| Right | Right only | Below | Above |
| Up | Top | Right | Left |

The full chassis and attachments turn together. Side-facing poses have exactly
one colored visor; their opposite hull edge is plain armor.

Spawn-warning timing is still 750 ms. Warning placement stays a safe distance
from the player; approaching an announced marker does not cancel the spawn.

## Exact built-in generation prompts

### hover-drone movement sheet

```text
Use case: stylized-concept. Asset: a transparent production game sprite sheet for the EXACT enemy robot in the provided reference, preserving its design, identity, colors, and thick slightly uneven charcoal marker contours.
Subject and animation: Compact sage-green hovering disk shell, twin chunky side thruster pods, narrow coral-red hostile sensor slit, charcoal underside. Four hover-cycle phases: neutral thrusters, short exhaust strokes, neutral, longer exhaust strokes; slight shell bob in place, no floor shadow. Preserve the reference design.
Layout: one SQUARE sheet, 4 columns by 4 rows, exactly 16 equal cells, no grid drawn, no labels. Each sprite is fully contained in its own cell with comfortable transparent margins. Same actor scale and body center across all cells. Fill about 75 percent of a cell. Never overlap cells.
Rows from top to bottom: DOWN-facing four consecutive movement frames; LEFT-facing four movement frames; RIGHT-facing four movement frames; UP-facing four movement frames. This is a TOP-DOWN overhead game view for all four rows; change the robot's facing on the ground plane, do not change the camera to a side elevation or tall front portrait.
Columns: neutral pose, first motion extreme, neutral returning, opposite motion extreme. Visible mechanical motion must actually differ between frames. Maintain the same center so it will loop smoothly. Each row must face consistently in the specified direction in every frame.
Style: match the original reference closely: chunky black ink outlines, few large shapes, restrained flat color, at most two scratches per shell. Tiny sprite readability at 72-126 gameplay pixels matters more than detail. Genuine transparent alpha background, no ground, no background, no contact shadow, no gradients, no glow, no realism, no intricate wiring, no weapons added, no text or sheet decorations. Aim for 1024 by 1024, a precisely spaced square grid.
```

### skitter movement sheet

```text
Use case: stylized-concept. Asset: a transparent production game sprite sheet for the EXACT enemy robot in the provided reference, preserving its design, identity, colors, and thick slightly uneven charcoal marker contours.
Subject and animation: Low oxidized-teal angular shell with FOUR splayed jointed charcoal legs and a narrow coral-red sensor slit. Four genuine scuttling poses alternating opposite leg pairs forward and backward; keep the shell steady. Preserve the reference silhouette and four legs.
Layout: one SQUARE sheet, 4 columns by 4 rows, exactly 16 equal cells, no grid drawn, no labels. Each sprite is fully contained in its own cell with comfortable transparent margins. Same actor scale and body center across all cells. Fill about 75 percent of a cell. Never overlap cells.
Rows from top to bottom: DOWN-facing four consecutive movement frames; LEFT-facing four movement frames; RIGHT-facing four movement frames; UP-facing four movement frames. This is a TOP-DOWN overhead game view for all four rows; change the robot's facing on the ground plane, do not change the camera to a side elevation or tall front portrait.
Columns: neutral pose, first motion extreme, neutral returning, opposite motion extreme. Visible mechanical motion must actually differ between frames. Maintain the same center so it will loop smoothly. Each row must face consistently in the specified direction in every frame.
Style: match the original reference closely: chunky black ink outlines, few large shapes, restrained flat color, at most two scratches per shell. Tiny sprite readability at 72-126 gameplay pixels matters more than detail. Genuine transparent alpha background, no ground, no background, no contact shadow, no gradients, no glow, no realism, no intricate wiring, no weapons added, no text or sheet decorations. Aim for 1024 by 1024, a precisely spaced square grid.
```

### hauler movement sheet

```text
Use case: stylized-concept. Asset: a transparent production game sprite sheet for the EXACT enemy robot in the provided reference, preserving its design, identity, colors, and thick slightly uneven charcoal marker contours.
Subject and animation: Heavy squat rust-orange industrial shell with two broad charcoal tracks, a large simple claw on its left and a small piston on its right, coral-red sensor slit. Four movement phases with visibly advancing tread bands, a tiny alternating claw/piston recoil, and slight hull weight shift. Preserve the asymmetric reference design.
Layout: one SQUARE sheet, 4 columns by 4 rows, exactly 16 equal cells, no grid drawn, no labels. Each sprite is fully contained in its own cell with comfortable transparent margins. Same actor scale and body center across all cells. Fill about 75 percent of a cell. Never overlap cells.
Rows from top to bottom: DOWN-facing four consecutive movement frames; LEFT-facing four movement frames; RIGHT-facing four movement frames; UP-facing four movement frames. This is a TOP-DOWN overhead game view for all four rows; change the robot's facing on the ground plane, do not change the camera to a side elevation or tall front portrait.
Columns: neutral pose, first motion extreme, neutral returning, opposite motion extreme. Visible mechanical motion must actually differ between frames. Maintain the same center so it will loop smoothly. Each row must face consistently in the specified direction in every frame.
Style: match the original reference closely: chunky black ink outlines, few large shapes, restrained flat color, at most two scratches per shell. Tiny sprite readability at 72-126 gameplay pixels matters more than detail. Genuine transparent alpha background, no ground, no background, no contact shadow, no gradients, no glow, no realism, no intricate wiring, no weapons added, no text or sheet decorations. Aim for 1024 by 1024, a precisely spaced square grid.
```

### Hauler attachment orientation correction

```text
Edit this hauler sprite sheet to FIX THE RIGID WHOLE-ROBOT ROTATION in rows 2, 3, and 4. Preserve the existing bold charcoal and flat rust-orange style, exact robot identity, transparent background, 4 columns by 4 rows layout, and four small tread/claw movement phases per row. Every cell shows the SAME complete robot rotated together in the ground plane, including BOTH arm attachments, tracks, sensor, shell and scratches.
CRITICAL orientation map, in image/screen coordinates:
ROW 1 DOWN: leave this orientation as the reference. The red sensor is on the BOTTOM edge. Large claw attached to LEFT edge of shell; small piston attached to RIGHT edge. Tracks are vertical on left/right.
ROW 2 LEFT: rotate the ENTIRE row-1 robot 90 degrees CLOCKWISE as one rigid assembly. Red sensor on LEFT edge. Large claw attached at the TOP edge pointing UP; small piston attached at the BOTTOM edge pointing DOWN. Tracks are horizontal above and below the shell. THE ARMS MUST BE ABOVE AND BELOW, NOT ON LEFT AND RIGHT.
ROW 3 RIGHT: rotate the ENTIRE row-1 robot 90 degrees COUNTERCLOCKWISE as one rigid assembly. Red sensor on RIGHT edge. Large claw at BOTTOM edge pointing DOWN; small piston at TOP edge pointing UP. Tracks horizontal above/below. THE ARMS MUST BE ABOVE AND BELOW.
ROW 4 UP: rotate the ENTIRE row-1 robot 180 degrees. Sensor on TOP edge. Large claw on RIGHT edge; small piston on LEFT edge. Tracks vertical on left/right.
Keep the claw attached to the same physical side of the orange hull at every facing. Do not merely move the sensor or redraw the tracks while leaving the arms fixed on screen. The result must be a correct top-down directional animation sheet. Keep each entire pose comfortably inside its cell, same scale and consistent centered alignment, no clipping, no text or grid lines, real transparent alpha.
```

### Hauler single-visor correction

```text
Make a PRECISE SMALL CORRECTION to this transparent 4-by-4 hauler movement sprite sheet. Keep ALL robot positions, camera angles, colors, outlines, tread animations, claw positions, piston positions, scale, framing, alpha transparency, and the 4x4 cell layout intact.
Only fix the DUPLICATED VISOR-LIKE SIDE STRIPS in rows 2 and 3:
ROW 2 (moving LEFT): each robot must have EXACTLY ONE red/orange outlined sensor visor, on the LEFT edge of the orange hull. REMOVE the small visor-shaped outlined orange strip on the RIGHT hull edge completely; replace that opposite edge with plain continuous orange armor. The large claw stays ABOVE the hull and piston BELOW.
ROW 3 (moving RIGHT): each robot must have EXACTLY ONE red/orange outlined sensor visor, on the RIGHT edge of the orange hull. REMOVE the visor-shaped outlined orange strip on the LEFT hull edge completely; replace that opposite edge with plain continuous orange armor. The piston stays ABOVE the hull and large claw BELOW.
The opposite side must be blank orange shell with NO small outlined rectangular panel, slit, orange bar, or duplicate eye. There must never be a face on both the left and right edges of one robot.
ROW 1 remains down-facing with its one visor on the bottom, claw left and piston right.
ROW 4 remains up-facing with its one visor on top, claw right and piston left.
Do not change anything else. Genuine transparent background. No text, labels, grid, or extra sprites.
```

### scrap

```text
Use case: stylized-concept. Asset type: a single transparent 2D gameplay sprite for Chatastrophe.
ONE collectible scrap currency token: a chunky mustard-yellow hexagonal metal nut with a clear charcoal-rimmed central hole and one tiny chipped corner. Three simple flat shapes, tiny ivory highlight. Compact instantly recognizable silhouette at 20 game pixels. Top-down view. Do not add other loose objects, piles, a coin rim, numbers, or text.
Style reference: match the supplied paper-and-ink robot artwork, using bold slightly uneven charcoal marker outlines, a few large flat color blocks, very restrained detail. Original art, compact clean composition, game readability first.
Palette: warm paper ivory #F4F0E6, charcoal #292B27, salvage yellow #E4B839, and danger coral #EE6B59 as appropriate to the subject.
Composition: ONE isolated sprite centered on a square, generous empty transparent margin on all sides. Genuine transparent alpha background. No paper rectangle, floor, shadows, checker pattern, borders, labels, multiple views, scenery, gradients, photorealism, textures, 3D bevels, or diffuse glow. A clean ink sprite with actual alpha transparency.
```

### bolt

```text
Use case: stylized-concept. Asset type: a single transparent 2D gameplay sprite for Chatastrophe.
ONE tiny radial energy pellet projectile: bright ivory circular center, mustard-yellow inner ring, coral-orange outer accent, bold irregular charcoal outline with four short stubby spark points. Roughly circular and direction-neutral, no long tail; must read at 14 game pixels. Flat color, no light bloom or blur. Distinct from a hexagonal currency nut.
Style reference: match the supplied paper-and-ink robot artwork, using bold slightly uneven charcoal marker outlines, a few large flat color blocks, very restrained detail. Original art, compact clean composition, game readability first.
Palette: warm paper ivory #F4F0E6, charcoal #292B27, salvage yellow #E4B839, and danger coral #EE6B59 as appropriate to the subject.
Composition: ONE isolated sprite centered on a square, generous empty transparent margin on all sides. Genuine transparent alpha background. No paper rectangle, floor, shadows, checker pattern, borders, labels, multiple views, scenery, gradients, photorealism, textures, 3D bevels, or diffuse glow. A clean ink sprite with actual alpha transparency.
```

### spawn-warning

```text
Use case: stylized-concept. Asset type: a single transparent 2D gameplay sprite for Chatastrophe.
ONE custom ground spawn-warning marker, viewed directly from above: a hand-inked coral-orange broken circular ring with four short charcoal inward-facing tick marks, surrounding a large clear coral exclamation mark with a charcoal outline. Sparse translucent-free negative space inside the ring. Instantly legible at 64 game pixels. Keep the ring round and the exclamation mark upright. No words, numbers, typography labels, background plate, extra icons, or glow.
Style reference: match the supplied paper-and-ink robot artwork, using bold slightly uneven charcoal marker outlines, a few large flat color blocks, very restrained detail. Original art, compact clean composition, game readability first.
Palette: warm paper ivory #F4F0E6, charcoal #292B27, salvage yellow #E4B839, and danger coral #EE6B59 as appropriate to the subject.
Composition: ONE isolated sprite centered on a square, generous empty transparent margin on all sides. Genuine transparent alpha background. No paper rectangle, floor, shadows, checker pattern, borders, labels, multiple views, scenery, gradients, photorealism, textures, 3D bevels, or diffuse glow. A clean ink sprite with actual alpha transparency.
```
