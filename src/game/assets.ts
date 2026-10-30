export const ASSETS = {
  arena: { file: 'arena.png' },
  scavenger: {
    file: 'scavenger.png',
    bounds: { x: 241, y: 219, width: 793, height: 763 },
  },
  skitter: {
    file: 'skitter.png',
    bounds: { x: 300, y: 193, width: 937, height: 649 },
  },
  hauler: {
    file: 'hauler.png',
    bounds: { x: 83, y: 249, width: 1180, height: 558 },
  },
} as const;

export type MachineKey = Exclude<keyof typeof ASSETS, 'arena'>;
