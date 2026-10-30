import Phaser from 'phaser';
import { ASSETS, ATLAS_ASSETS } from '../assets';
import { ARENA } from '../settings';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { Projectile } from '../entities/Projectile';
import { Scrap } from '../entities/Scrap';
import { ENEMY_DIED, type EnemyDeath } from '../events/gameEvents';
import { ENEMIES, LIMITS, Run, SPAWN, WEAPON, nearest, safeSpawn, scrapValue, type EnemyKind, type Upgrade } from '../systems/run';
import { GameUI } from '../ui/GameUI';

interface Warning { x: number; y: number; kind: EnemyKind; remainingMs: number; marker: Phaser.GameObjects.Image }

export class ArenaScene extends Phaser.Scene {
  run!: Run;
  player!: Player;
  enemies!: Phaser.GameObjects.Group;
  projectiles!: Phaser.GameObjects.Group;
  pickups!: Phaser.GameObjects.Group;
  warnings: Warning[] = [];
  paused = false;
  private effects!: Phaser.GameObjects.Group;
  private ui?: GameUI;
  private spawnRemaining = 0;
  private attackRemaining = 0;
  private settling = false;
  private autoStart = false;
  private reducedMotion = false;

  constructor() { super('ArenaScene'); }

  init(data: { start?: boolean } = {}): void {
    this.run = new Run();
    this.warnings = [];
    this.paused = false;
    this.spawnRemaining = 0;
    this.attackRemaining = 0;
    this.settling = false;
    this.autoStart = Boolean(data.start);
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  preload(): void {
    const loading = document.getElementById('load-status')!;
    loading.hidden = false;
    loading.textContent = 'Unfolding the paper world…';
    document.getElementById('game-container')!.dataset.ready = 'false';
    document.getElementById('game-menu')!.hidden = true;
    for (const [key, asset] of Object.entries(ASSETS)) {
      if (!this.textures.exists(key)) this.load.image(key, `${import.meta.env.BASE_URL}assets/${asset.file}`);
    }
    for (const [key, asset] of Object.entries(ATLAS_ASSETS)) {
      if (!this.textures.exists(key)) this.load.atlas(key, `${import.meta.env.BASE_URL}assets/${asset.file}`, `${import.meta.env.BASE_URL}assets/${asset.atlas}`);
    }
  }

  create(): void {
    const missing = [...Object.keys(ASSETS), ...Object.keys(ATLAS_ASSETS)].filter(key => !this.textures.exists(key));
    if (missing.length > 0) {
      document.getElementById('load-status')!.textContent = `Could not load the artwork (${missing.join(', ')}). Reload the page to retry.`;
      document.getElementById('scene-status')!.textContent = 'Artwork unavailable';
      return;
    }
    this.physics.world.setBounds(0, 0, ARENA.width, ARENA.height);
    this.physics.world.resume();
    this.time.paused = false;
    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height);
    this.add.image(ARENA.width / 2, ARENA.height / 2, 'arena').setDisplaySize(ARENA.width, ARENA.height);
    this.add.rectangle(ARENA.width / 2, ARENA.height / 2, ARENA.width - 4, ARENA.height - 4)
      .setStrokeStyle(3, 0x5b6056, 0.5);
    this.enemies = this.add.group();
    this.projectiles = this.add.group();
    this.pickups = this.add.group();
    this.effects = this.add.group();
    this.player = new Player(this, ARENA.width / 2, ARENA.height / 2, this.reducedMotion);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.physics.add.overlap(this.projectiles, this.enemies, (a, b) => {
      if (a instanceof Projectile && b instanceof Enemy) this.projectileHit(a, b);
    });
    this.physics.add.overlap(this.player, this.enemies, (_player, enemy) => {
      if (enemy instanceof Enemy) this.contact(enemy);
    });
    this.physics.add.overlap(this.player, this.pickups, (_player, pickup) => {
      if (pickup instanceof Scrap && this.run.phase === 'playing') this.collect(pickup);
    });
    this.events.on(ENEMY_DIED, this.dropScrap, this);
    this.ui = new GameUI({
      start: () => this.startWave(), restart: () => this.restartRun(), pause: () => this.togglePause(),
      buy: (upgrade: Upgrade) => { this.run.buy(upgrade); this.ui?.render(this.run, this.paused); },
    });
    const blur = (): void => { if (!this.paused) this.togglePause(); };
    const visibility = (): void => { if (document.hidden) blur(); };
    this.game.events.on(Phaser.Core.Events.BLUR, blur);
    document.addEventListener('visibilitychange', visibility);
    this.input.keyboard!.on('keydown-ESC', this.togglePause, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ui?.destroy();
      this.ui = undefined;
      this.game.events.off(Phaser.Core.Events.BLUR, blur);
      document.removeEventListener('visibilitychange', visibility);
      this.events.off(ENEMY_DIED, this.dropScrap, this);
      this.clearWarnings();
      this.time.paused = false;
    });
    this.physics.pause();
    document.getElementById('load-status')!.hidden = true;
    document.getElementById('game-container')!.dataset.ready = 'true';
    if (this.autoStart) this.startWave();
    this.ui.render(this.run, false);
  }

  update(_time: number, delta: number): void {
    if (!this.player || !this.ui || this.paused) return;
    if (this.run.phase === 'playing') {
      const dt = Math.min(delta, 100);
      if (this.run.tick(dt)) this.endWave();
      else {
        this.player.control(this.run.speed);
        this.player.setAlpha(this.run.invulnerable ? 0.55 : 1);
        for (const enemy of this.enemies.getChildren() as Enemy[]) enemy.chase(this.player);
        this.updateSpawning(dt);
        this.updateCombat(dt);
        this.updatePickups();
      }
    } else if (this.run.phase === 'settling' && !this.settling) this.endWave();
    this.ui.render(this.run, this.paused);
  }

  startWave(): void {
    if (!this.run.startWave()) return;
    this.spawnRemaining = 250;
    this.attackRemaining = 0;
    this.settling = false;
    this.player.setAlpha(1).clearTint();
    this.input.keyboard!.resetKeys();
    this.physics.resume();
    this.ui?.render(this.run, false);
  }

  restartRun(): void { this.scene.restart({ start: true }); }

  togglePause(): void {
    if (this.run.phase !== 'playing') return;
    this.paused = !this.paused;
    this.input.keyboard!.resetKeys();
    this.player.setVelocity(0);
    this.time.paused = this.paused;
    if (this.paused) {
      this.physics.pause(); this.tweens.pauseAll(); this.player.anims.pause();
      for (const enemy of this.enemies.getChildren() as Enemy[]) enemy.anims.pause();
    } else {
      this.physics.resume(); this.tweens.resumeAll(); this.player.anims.resume();
      for (const enemy of this.enemies.getChildren() as Enemy[]) enemy.anims.resume();
    }
    this.ui?.render(this.run, this.paused);
  }

  spawnEnemy(kind: EnemyKind, x: number, y: number): Enemy | undefined {
    if (this.run.phase !== 'playing' || this.enemies.getLength() >= LIMITS.enemies) return;
    const enemy = new Enemy(this, x, y, kind);
    this.enemies.add(enemy);
    enemy.chase(this.player);
    return enemy;
  }

  private updateSpawning(dt: number): void {
    for (const warning of [...this.warnings]) {
      warning.remainingMs -= dt;
      if (warning.remainingMs > 0) continue;
      warning.marker.destroy();
      this.warnings.splice(this.warnings.indexOf(warning), 1);
      this.spawnEnemy(warning.kind, warning.x, warning.y);
    }
    this.spawnRemaining -= dt;
    if (this.spawnRemaining > 0) return;
    this.spawnRemaining = this.run.waveConfig.spawnMs;
    if (this.enemies.getLength() + this.warnings.length >= LIMITS.enemies || this.warnings.length >= LIMITS.warnings) return;
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = Phaser.Math.Between(SPAWN.margin, ARENA.width - SPAWN.margin);
      const y = Phaser.Math.Between(SPAWN.margin, ARENA.height - SPAWN.margin);
      if (!safeSpawn({ x, y }, this.player)) continue;
      const bounds = ASSETS['spawn-warning'].bounds;
      const marker = this.add.image(x, y, 'spawn-warning').setDepth(3);
      marker.setDisplayOrigin(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2).setScale(64 / bounds.width);
      if (!this.reducedMotion) this.tweens.add({ targets: marker, scaleX: marker.scaleX * 0.78, scaleY: marker.scaleY * 0.78, duration: SPAWN.warningMs });
      const mix = this.run.waveConfig.mix;
      this.warnings.push({ x, y, kind: mix[Phaser.Math.Between(0, mix.length - 1)], remainingMs: SPAWN.warningMs, marker });
      break;
    }
  }

  private updateCombat(dt: number): void {
    for (const bullet of [...this.projectiles.getChildren()] as Projectile[]) {
      bullet.remainingMs -= dt;
      if (bullet.remainingMs <= 0 || bullet.x < 0 || bullet.y < 0 || bullet.x > ARENA.width || bullet.y > ARENA.height) bullet.destroy();
    }
    this.attackRemaining -= dt;
    if (this.attackRemaining > 0 || this.projectiles.getLength() >= LIMITS.projectiles) return;
    const target = nearest(this.player, this.enemies.getChildren() as Enemy[], WEAPON.range);
    if (!target) return;
    this.projectiles.add(new Projectile(this, this.player.x, this.player.y, target, this.run.damage));
    this.attackRemaining = this.run.attackMs;
  }

  private projectileHit(bullet: Projectile, enemy: Enemy): void {
    if (this.run.phase !== 'playing' || !bullet.active || !enemy.active) return;
    const damage = bullet.damage;
    bullet.destroy();
    enemy.health -= damage;
    this.burst(enemy.x, enemy.y, 0xe4b839, 10);
    if (enemy.health <= 0) this.killEnemy(enemy, 'combat');
    else {
      enemy.setTint(0xf4f0e6).setTintMode(Phaser.TintModes.FILL);
      this.time.delayedCall(80, () => { if (enemy.active) enemy.clearTint(); });
    }
  }

  private contact(enemy: Enemy): void {
    if (!enemy.active || this.paused || !this.run.hurt(ENEMIES[enemy.kind].damage)) return;
    this.player.setTint(0xee6b59).setTintMode(Phaser.TintModes.FILL);
    this.time.delayedCall(110, () => { if (this.player.active) this.player.clearTint(); });
    if (this.run.phase === 'lost') {
      this.freezeArena();
      this.clearWarnings();
      this.player.setAlpha(0.5);
      this.ui?.render(this.run, false);
    }
  }

  private killEnemy(enemy: Enemy, reason: EnemyDeath['reason']): void {
    if (!enemy.active) return;
    const event: EnemyDeath = { kind: enemy.kind, x: enemy.x, y: enemy.y, reason, scrap: scrapValue(enemy.kind, reason) };
    if (this.effects.getLength() < LIMITS.effects) {
      const ghost = this.add.image(enemy.x, enemy.y, enemy.texture.key, enemy.frame.name).setDisplayOrigin(enemy.displayOriginX, enemy.displayOriginY)
        .setScale(enemy.scaleX).setDepth(9).setTint(reason === 'shutdown' ? 0x87936b : 0x5b6056);
      this.effects.add(ghost);
      this.tweens.add({ targets: ghost, alpha: 0, scaleX: ghost.scaleX * 0.7, scaleY: ghost.scaleY * 0.7, duration: this.reducedMotion ? 80 : 220, onComplete: () => ghost.destroy() });
    }
    enemy.destroy();
    if (reason === 'combat') this.run.kills++;
    this.events.emit(ENEMY_DIED, event);
  }

  private dropScrap(event: EnemyDeath): void {
    this.burst(event.x, event.y, 0x87936b, 17);
    if (this.pickups.getLength() >= LIMITS.pickups) this.run.collect(event.scrap);
    else this.pickups.add(new Scrap(this, event.x, event.y, event.scrap));
  }

  private updatePickups(): void {
    for (const pickup of this.pickups.getChildren() as Scrap[]) {
      const distance = Phaser.Math.Distance.BetweenPoints(pickup, this.player);
      if (distance < 110) this.physics.moveToObject(pickup, this.player, 390);
      else pickup.setVelocity(0);
    }
  }

  private collect(pickup: Scrap): void {
    if (!pickup.active) return;
    this.run.collect(pickup.value);
    pickup.destroy();
  }

  private endWave(): void {
    if (this.settling) return;
    this.settling = true;
    this.freezeArena();
    this.clearWarnings();
    this.player.setAlpha(1).clearTint();
    for (const enemy of [...this.enemies.getChildren()] as Enemy[]) this.killEnemy(enemy, 'shutdown');
    this.time.delayedCall(450, () => {
      for (const pickup of [...this.pickups.getChildren()] as Scrap[]) {
        this.run.collect(pickup.value);
        this.tweens.add({ targets: pickup, x: this.player.x, y: this.player.y, alpha: 0, duration: this.reducedMotion ? 0 : 220, onComplete: () => pickup.destroy() });
      }
      this.time.delayedCall(230, () => {
        this.pickups.clear(true, true);
        this.effects.clear(true, true);
        this.run.finishWave();
        this.ui?.render(this.run, false);
      });
    });
  }

  private freezeArena(): void {
    this.player.setVelocity(0);
    this.player.idle();
    for (const enemy of this.enemies.getChildren() as Enemy[]) { enemy.setVelocity(0); enemy.anims.stop(); }
    this.projectiles.clear(true, true);
    this.physics.pause();
  }

  private clearWarnings(): void {
    for (const warning of this.warnings) warning.marker.destroy();
    this.warnings = [];
  }

  private burst(x: number, y: number, color: number, radius: number): void {
    if (this.effects.getLength() >= LIMITS.effects || this.reducedMotion) return;
    const ring = this.add.circle(x, y, radius).setStrokeStyle(2, color).setDepth(11);
    this.effects.add(ring);
    this.tweens.add({ targets: ring, scale: 1.6, alpha: 0, duration: 170, onComplete: () => ring.destroy() });
  }

}
