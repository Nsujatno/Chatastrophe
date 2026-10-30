import Phaser from 'phaser';
import { ASSETS } from '../assets';

export class Scrap extends Phaser.Physics.Arcade.Image {
  declare body: Phaser.Physics.Arcade.Body;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly value: number) {
    super(scene, x, y, 'scrap');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const bounds = ASSETS.scrap.bounds;
    this.setDisplayOrigin(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    this.setScale(20 / bounds.width).setDepth(4);
    const radius = 6 / this.scaleX;
    this.body.setCircle(radius, this.displayOriginX - radius, this.displayOriginY - radius);
  }
}
