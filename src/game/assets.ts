export const ASSETS = {
  arena: { file: 'arena.png' },
  scrap: {
    file: 'scrap.png',
    bounds: { x: 326, y: 350, width: 603, height: 558 },
  },
  bolt: {
    file: 'bolt.png',
    bounds: { x: 332, y: 325, width: 590, height: 588 },
  },
  'spawn-warning': {
    file: 'spawn-warning.png',
    bounds: { x: 127, y: 127, width: 999, height: 978 },
  },
} as const;

export const ATLAS_ASSETS = {
  'scavenger-walk': { file: 'scavenger-walk.png', atlas: 'scavenger-walk.json' },
  'hover-drone-move': { file: 'hover-drone-move.png', atlas: 'hover-drone-move.json' },
  'skitter-move': { file: 'skitter-move.png', atlas: 'skitter-move.json' },
  'hauler-move': { file: 'hauler-move.png', atlas: 'hauler-move.json' },
} as const;
