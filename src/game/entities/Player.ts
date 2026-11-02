import Phaser from 'phaser';
import { movement, type Facing } from '../systems/run';
import { ARENA } from '../settings';

export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  facing: Facing = 'down';
  private keys: Record<string, Phaser.Input.Keyboard.Key>;

  constructor(scene: Phaser.Scene, x: number, y: number, private readonly reducedMotion = false) {
    super(scene, x, y, 'scavenger-walk', 'down-0');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setScale(0.31).setDepth(10).setCollideWorldBounds(true);
    this.body.setCircle(62, 98, 98);
    this.body.setBoundsRectangle(new Phaser.Geom.Rectangle(24, 24, ARENA.width - 48, ARENA.height - 48));
    this.body.preUpdate(false, 0);
    this.keys = scene.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    for (const direction of ['down', 'left', 'right', 'up']) {
      for (const walking of [false, true]) {
        const key = `${walking ? 'walk' : 'idle'}-${direction}`;
        if (scene.anims.exists(key)) continue;
        const frames = walking ? (direction === 'left' ? [0, 1, 2, 1] : [0, 1, 2, 3]) : [0, 2];
        scene.anims.create({ key, frames: frames.map(frame => ({ key: 'scavenger-walk', frame: `${direction}-${frame}` })), frameRate: walking ? 9 : 2, repeat: -1 });
      }
    }
    this.idle();
  }

  control(speed: number): void {
    const down = (a: string, b: string) => this.keys[a].isDown || this.keys[b].isDown;
    const x = Number(down('D', 'RIGHT')) - Number(down('A', 'LEFT'));
    const y = Number(down('S', 'DOWN')) - Number(down('W', 'UP'));
    const velocity = movement(x, y, speed);
    this.setVelocity(velocity.x, velocity.y);
    if (x !== 0) this.facing = x < 0 ? 'left' : 'right';
    else if (y !== 0) this.facing = y < 0 ? 'up' : 'down';
    if (x || y) this.play(`walk-${this.facing}`, true);
    else this.idle();
  }

  idle(): void {
    if (this.reducedMotion) { this.anims.stop(); this.setFrame(`${this.facing}-0`); }
    else this.play(`idle-${this.facing}`, true);
  }
}
