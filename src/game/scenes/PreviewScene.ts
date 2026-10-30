import Phaser from 'phaser';
import { ASSETS, type MachineKey } from '../assets';
import { ARENA, INK, PAPER } from '../settings';

export class PreviewScene extends Phaser.Scene {
  private notes: Phaser.GameObjects.Text[] = [];
  private idle?: Phaser.Tweens.Tween;

  constructor() {
    super('PreviewScene');
  }

  init(): void {
    this.notes = [];
    this.idle = undefined;
  }

  preload(): void {
    const loading = document.querySelector<HTMLElement>('#load-status')!;
    loading.hidden = false;
    loading.textContent = 'Unfolding the paper world…';
    document.querySelector<HTMLElement>('#game-container')!.dataset.ready = 'false';
    for (const [key, asset] of Object.entries(ASSETS)) {
      if (!this.textures.exists(key)) {
        this.load.image(key, `${import.meta.env.BASE_URL}assets/${asset.file}`);
      }
    }
  }

  create(): void {
    const status = document.querySelector<HTMLElement>('#scene-status')!;
    const loading = document.querySelector<HTMLElement>('#load-status')!;
    const missing = Object.keys(ASSETS).filter((key) => !this.textures.exists(key));
    if (missing.length > 0) {
      loading.textContent = `Could not load the artwork (${missing.join(', ')}). Reload the page to retry.`;
      status.textContent = 'Artwork unavailable';
      return;
    }

    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height);
    this.cameras.main.centerOn(ARENA.width / 2, ARENA.height / 2);
    this.add.image(ARENA.width / 2, ARENA.height / 2, 'arena')
      .setDisplaySize(ARENA.width, ARENA.height);

    this.machine('hauler', 1085, 520, 152);
    this.machine('skitter', 530, 337, 92);
    const scavenger = this.machine('scavenger', 800, 450, 76);
    this.idle = this.tweens.add({
      targets: scavenger,
      y: { from: 450, to: 447 },
      duration: 1050,
      ease: 'Sine.easeInOut',
      repeat: -1,
      yoyo: true,
    });

    this.note(800, 514, '01 / THE SCAVENGER', 'Small frame. Still curious.');
    this.note(530, 387, '02 / SKITTER', 'Enemy silhouette · static sample');
    this.note(1085, 602, '03 / HAULER', 'Enemy silhouette · static sample');

    this.bindControls(status);
    loading.hidden = true;
    document.querySelector<HTMLElement>('#game-container')!.dataset.ready = 'true';
  }

  private machine(key: MachineKey, x: number, y: number, width: number): Phaser.GameObjects.Image {
    const frame = ASSETS[key].bounds;
    const image = this.add.image(x, y, key).setName(key);
    image.setDisplayOrigin(frame.x + frame.width / 2, frame.y + frame.height / 2);
    image.setScale(width / frame.width);
    return image;
  }

  private note(x: number, y: number, title: string, caption: string): void {
    const heading = this.add.text(x, y, title, {
      fontFamily: 'Courier New, monospace', fontSize: '14px', color: INK,
      backgroundColor: PAPER, padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 0);
    const description = this.add.text(x, y + 29, caption, {
      fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#5b6056',
    }).setOrigin(0.5, 0);
    this.notes.push(heading, description);
  }

  private bindControls(status: HTMLElement): void {
    const annotations = document.querySelector<HTMLInputElement>('#annotations')!;
    const motion = document.querySelector<HTMLButtonElement>('#motion')!;
    const reset = document.querySelector<HTMLButtonElement>('#reset')!;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const controller = new AbortController();
    const options = { signal: controller.signal };
    let paused = media.matches;

    const syncMotion = (): void => {
      if (paused) this.idle?.pause();
      else this.idle?.resume();
      motion.textContent = paused ? 'Resume idle' : 'Pause idle';
      motion.setAttribute('aria-pressed', String(paused));
      status.textContent = paused ? 'Yard ready · idle paused' : 'Yard ready · idle running';
    };
    const syncNotes = (): void => {
      for (const note of this.notes) note.setVisible(annotations.checked);
    };

    annotations.disabled = motion.disabled = reset.disabled = false;
    syncNotes();
    syncMotion();
    annotations.addEventListener('change', syncNotes, options);
    motion.addEventListener('click', () => { paused = !paused; syncMotion(); }, options);
    reset.addEventListener('click', () => this.scene.restart(), options);
    media.addEventListener('change', () => { paused = media.matches; syncMotion(); }, options);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      controller.abort();
      annotations.disabled = motion.disabled = reset.disabled = true;
      this.notes = [];
      this.idle = undefined;
    });
  }
}
