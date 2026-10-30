# Hover drone concept v1

Generated 2026-10-30 using the built-in image-generation tool.

Status: approved by the owner on 2026-10-30 as the basic hovering enemy for M1.
The approved reference sprite is saved to `public/assets/hover-drone.png`.
M1 uses its directional `hover-drone-move.png` / `hover-drone-move.json` atlas,
registered in `src/game/assets.ts`, as the basic pursuing enemy.

Image: `hover-drone-v1.png` (1536 × 1024 PNG with alpha transparency).

Visible silhouette bounds (alpha ≥ 128): x=174, y=229, width=1180, height=513.

Style references: `public/assets/skitter.png`, `public/assets/hauler.png`, and
`public/assets/scavenger.png`. Original reference assets are unchanged.

## Generation prompt

```text
Use case: stylized-concept.
Asset type: one transparent-background 2D enemy sprite concept for the Chatastrophe arena survival game, to be reviewed before integration.
Input images: the existing skitter, hauler, and scavenger PNGs are STYLE AND CAMERA REFERENCES ONLY. Preserve those original assets; create a separate new enemy design belonging to the same set.
Primary request: a small basic HOVERING enemy robot. A squat rounded disk-shaped muted sage-green shell, a narrow hostile coral-red horizontal sensor slit on the near/front rim, a simple charcoal underside, and two short chunky side thruster pods. No legs or tracks. Make hovering readable through the compact thruster silhouette, with at most two short restrained off-white exhaust strokes attached to the underside.
Style/medium: match the references closely: extremely simple hand-drawn marker cartoon, bold slightly uneven charcoal outlines, a few large flat color blocks, minimal surface detail, maximum two little scratch marks. Muted sage (#87936B), charcoal (#292B27), off-white (#F4F0E6), and a small coral (#EE6B59) sensor accent. The player owns yellow; keep this enemy sage.
Composition/framing: one isolated complete robot centered with comfortable transparent margins, same top-down overhead game camera as the reference sprites. See primarily the top of its shell with a thin foreshortened front rim; keep it squat rather than a tall portrait. Large clean compact silhouette that reads instantly at 64-76 gameplay pixels. Entire design fully visible.
Scene/backdrop: genuinely transparent alpha background, no ground or scene.
Constraints: original design; one sprite only; no labels, text, watermark, border, contact sheet, weapons, extra characters, floor shadow, glow, gradients, realistic rendering, intricate machinery, dense texture, or dramatic perspective. Preserve the restrained sketchbook robot-world identity of the references.
```
