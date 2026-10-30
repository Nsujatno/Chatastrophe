# Artwork prompts

The M1 directional player sheet and its exact built-in generation prompt are
documented in [scavenger-animation.md](scavenger-animation.md).
Enemy movement sheets, the hauler orientation corrections, and the custom scrap,
projectile, and spawn-warning PNG prompts are in
[enemy-and-gameplay-art.md](enemy-and-gameplay-art.md).

Generated with the built-in image-generation tool on 2026-10-30. These are the simplified top-down variants selected after the owner's feedback. The earlier detailed/front-facing variants are not used. All raster assets are copied into the project; no remote runtime image dependency exists.

The character PNGs have real alpha transparency. Phaser origins and scales use silhouette bounds to account for empty margins; the source pixels are unchanged. The favicon is a small code-authored SVG interface mark, not a gameplay sprite.

## arena

Saved to `public/assets/arena.png`. Transparent background: false.

Original tiny 2D TOP-DOWN arena survival game asset. Extremely SIMPLE hand-drawn doodle cartoon like a black marker drawing with flat color fill. Thick slightly wobbly black outlines. Very few large shapes. No shading, NO rendering, NO fine mechanical detail, NO weathering texture, NO gradients, NO realistic materials, NO 3D. Must be instantly legible at 64 pixels. Orthographic camera looking DOWN from above, no horizon, no low camera angle. Landscape 16:9 pale off-white paper arena background. Almost blank light paper with barely visible grain, 85 percent empty playing ground. Only outer corners contain a handful of small extremely simple doodles: a broken pipe drawn as two flat gray rounded rectangles, cracked concrete blocks, short bent pole with one cable, a few tiny grass strokes. Minimal black linework and sparse muted sage and rust-orange accent. Top-down overhead floor plan, all props small in scale, no perspective depth. No characters, no labels, no interface. It must look like a playful sketchbook game, not a painted environment.

## scavenger

Saved to `public/assets/scavenger.png`. Transparent background: true.

Original tiny 2D TOP-DOWN arena survival game asset. Extremely SIMPLE hand-drawn doodle cartoon like a black marker drawing with flat color fill. Thick slightly wobbly black outlines. Very few large shapes. No shading, NO rendering, NO fine mechanical detail, NO weathering texture, NO gradients, NO realistic materials, NO 3D. Must be instantly legible at 64 pixels. Orthographic camera looking DOWN from above, no horizon, no low camera angle. One isolated small friendly scavenger ROBOT player sprite on transparent background, centered with margin. Oversized soft square mustard-yellow head/shell, ONE large off-white optic with charcoal center visible on the near side, tiny dark body, two small stubby feet barely protruding below shell, simple short claw arms and a bent antenna. Maximum 12 main shapes and 3 little scratch marks. Top-down overhead camera seeing primarily TOP of head and shoulders, foreshortened body. Charming asymmetrical silhouette. Flat yellow and charcoal with white optic. No equipment detail, no shadow, no ground, no text.

## skitter

Saved to `public/assets/skitter.png`. Transparent background: true.

Original tiny 2D TOP-DOWN arena survival game asset. Extremely SIMPLE hand-drawn doodle cartoon like a black marker drawing with flat color fill. Thick slightly wobbly black outlines. Very few large shapes. No shading, NO rendering, NO fine mechanical detail, NO weathering texture, NO gradients, NO realistic materials, NO 3D. Must be instantly legible at 64 pixels. Orthographic camera looking DOWN from above, no horizon, no low camera angle. One isolated small enemy skittering ROBOT drone sprite on transparent background, centered with margin. Top-down overhead view of a flat oxidized-teal angular central shell with FOUR splayed black jointed legs, one coral red horizontal sensor mark near front. Maximum 10 main shapes, no screws or wiring, no texture. Low wide sharp spider-like silhouette readable at 64 pixels, 3-5 pixel equivalent thick marker contour. Flat teal, charcoal, coral, off-white. No glow, no shadow, no ground, no text.

## hauler

Saved to `public/assets/hauler.png`. Transparent background: true.

Original tiny 2D TOP-DOWN arena survival game asset. Extremely SIMPLE hand-drawn doodle cartoon like a black marker drawing with flat color fill. Thick slightly wobbly black outlines. Very few large shapes. No shading, NO rendering, NO fine mechanical detail, NO weathering texture, NO gradients, NO realistic materials, NO 3D. Must be instantly legible at 64 pixels. Orthographic camera looking DOWN from above, no horizon, no low camera angle. One isolated heavy enemy industrial ROBOT sprite on transparent background, centered with margin. TOP-DOWN overhead view, squat wide rust-orange rectangular shell, two short broad charcoal tracks at sides, one oversized simple claw extending forward on its left, one small piston on right, a narrow coral red sensor mark on front edge. Maximum 12 main shapes, no machinery detailing, no texture, only two scratch marks. Broad asymmetrical threatening silhouette contrasts with round friendly player. Flat rust-orange, charcoal, off-white. No shadow, no ground, no text.

## hover-drone — M1

Saved to `public/assets/hover-drone.png`. Transparent background: true.
Generated with the built-in image-generation tool and approved by the owner
on 2026-10-30 as the basic hovering enemy. The existing three robot PNGs
were used as style references. See the [concept record](concepts/hover-drone-v1.md)
for the exact generation prompt and silhouette bounds.


