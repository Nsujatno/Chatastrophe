import Phaser from 'phaser';
import { createGameConfig } from './game/config';
import './style.css';
import { GameChat } from './chat/GameChat';
import type { ArenaScene } from './game/scenes/ArenaScene';

const game = new Phaser.Game(createGameConfig());
const chat = new GameChat(() => {
  const scene = game.scene.keys.ArenaScene as ArenaScene | undefined;
  return scene?.sabotage ? { manager: scene.sabotage, phase: scene.run.phase, paused: scene.paused,
    hold: (held: boolean) => { scene.directorPending = held; },
    typing: (focused: boolean) => {
      scene.input.keyboard!.enabled = !focused;
      if (focused) scene.input.keyboard!.disableGlobalCapture(); else scene.input.keyboard!.enableGlobalCapture();
      scene.input.keyboard!.resetKeys(); scene.player?.setVelocity(0);
    },
  } : undefined;
}, fn => { game.events.on(Phaser.Core.Events.POST_STEP, fn); return () => { game.events.off(Phaser.Core.Events.POST_STEP, fn); }; });

if (import.meta.env.MODE === 'test') Object.assign(window, { __game: game });

if (import.meta.hot) {
  import.meta.hot.dispose(() => { chat.destroy(); game.destroy(true); });
}
