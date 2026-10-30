import Phaser from 'phaser';
import { ENEMIES, type EnemyKind, type Facing } from '../systems/run';

const FRAME_RATES: Record<EnemyKind, number> = { 'hover-drone': 5, skitter: 12, hauler: 6 };

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  health: number;
  facing: Facing = 'down';

  constructor(scene: Phaser.Scene, x: number, y: number, readonly kind: EnemyKind) {
    const texture = `${kind}-move`;
    super(scene, x, y, texture, 'down-0');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const spec = ENEMIES[kind];
    this.health = spec.health;
    const visibleSize = Math.max(this.frame.cutWidth, this.frame.cutHeight);
    this.setScale(spec.width / visibleSize).setDepth(8);
    const radius = spec.radius / this.scaleX;
    this.body.setCircle(radius, this.displayOriginX - radius, this.displayOriginY - radius);
    this.setCollideWorldBounds(true);
    for (const direction of ['down', 'left', 'right', 'up'] as const) {
      const key = `${kind}-move-${direction}`;
      if (scene.anims.exists(key)) continue;
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNames(texture, { prefix: `${direction}-`, start: 0, end: 3 }),
        frameRate: FRAME_RATES[kind], repeat: -1,
      });
    }
  }

  chase(player: PlayerPosition): void {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    if (Math.abs(dx) > Math.abs(dy)) this.facing = dx < 0 ? 'left' : 'right';
    else if (dy !== 0) this.facing = dy < 0 ? 'up' : 'down';
    this.play(`${this.kind}-move-${this.facing}`, true);
    this.scene.physics.moveToObject(this, player, ENEMIES[this.kind].speed);
  }
}

interface PlayerPosition { x: number; y: number }
