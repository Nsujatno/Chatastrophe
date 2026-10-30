import Phaser from 'phaser';
import { WEAPON } from '../systems/run';
import { ASSETS } from '../assets';

export class Projectile extends Phaser.Physics.Arcade.Image {
  declare body: Phaser.Physics.Arcade.Body;
  remainingMs: number = WEAPON.lifetimeMs;

  constructor(scene: Phaser.Scene, x: number, y: number, target: { x: number; y: number }, readonly damage: number) {
    super(scene, x, y, 'bolt');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const bounds = ASSETS.bolt.bounds;
    this.setDisplayOrigin(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    this.setScale(14 / bounds.width).setDepth(12);
    const radius = 5 / this.scaleX;
    this.body.setCircle(radius, this.displayOriginX - radius, this.displayOriginY - radius);
    scene.physics.moveTo(this, target.x, target.y, WEAPON.speed);
  }
}
