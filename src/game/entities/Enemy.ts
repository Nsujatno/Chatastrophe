import Phaser from 'phaser';
import { ENEMIES, type EnemyKind, type Facing } from '../systems/run';
import { DEFAULT_PROFILE, type SpawnProfile } from '../../shared/rules';

export interface EnemyOptions { id: string; healthMultiplier?: number; profile?: SpawnProfile; tags?: string[]; generation?: number; owner?: string }

const FRAME_RATES: Record<EnemyKind, number> = { 'hover-drone': 5, skitter: 12, hauler: 6 };

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  health: number;
  facing: Facing = 'down';
  readonly entityId: string;
  readonly tags: readonly string[];
  readonly generation: number;
  readonly owner?: string;
  readonly baseSpeed: number;
  readonly baseDamage: number;
  readonly baseSize: number;
  readonly reward: number;
  speed: number;
  contactDamage: number;
  sizeMultiplier: number;
  private readonly baseScale: number;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly kind: EnemyKind, options: EnemyOptions) {
    const texture = `${kind}-move`;
    super(scene, x, y, texture, 'down-0');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const spec = ENEMIES[kind];
    const profile = options.profile ?? DEFAULT_PROFILE;
    this.entityId = options.id;
    this.tags = Object.freeze([...(options.tags ?? [])]);
    this.generation = options.generation ?? 0;
    this.owner = options.owner;
    this.health = spec.health * profile.health * (options.healthMultiplier ?? 1);
    this.speed = this.baseSpeed = spec.speed * profile.speed;
    this.contactDamage = this.baseDamage = spec.damage * profile.damage;
    this.sizeMultiplier = this.baseSize = profile.size;
    this.reward = spec.scrap * profile.reward;
    const visibleSize = Math.max(this.frame.cutWidth, this.frame.cutHeight);
    this.baseScale = spec.width / visibleSize;
    this.setScale(this.baseScale * profile.size).setDepth(8);
    const radius = spec.radius / this.baseScale;
    this.body.setCircle(radius, this.displayOriginX - radius, this.displayOriginY - radius);
    // Sync previous-frame coordinates too, so postUpdate cannot shift a new or resized sprite.
    this.body.preUpdate(false, 0);
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

  setSizeMultiplier(value: number): void {
    if (this.sizeMultiplier === value && this.scaleX === this.baseScale * value) return;
    this.sizeMultiplier = value;
    this.setScale(this.baseScale * value);
    this.body.preUpdate(false, 0);
  }

  chase(player: PlayerPosition): void {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    if (Math.abs(dx) > Math.abs(dy)) this.facing = dx < 0 ? 'left' : 'right';
    else if (dy !== 0) this.facing = dy < 0 ? 'up' : 'down';
    this.play(`${this.kind}-move-${this.facing}`, true);
    this.scene.physics.moveToObject(this, player, this.speed);
  }
}

interface PlayerPosition { x: number; y: number }
