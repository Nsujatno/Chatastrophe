import type { Run, Upgrade } from '../systems/run';
import { describeRuleset } from '../../shared/rules';
import type { SabotageManager } from '../rules/SabotageManager';

const element = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

export class GameUI {
  private controller = new AbortController();
  private previous = '';

  constructor(actions: { start: () => void; restart: () => void; pause: () => void; fullscreen: () => void; buy: (upgrade: Upgrade) => void }, private sabotage: SabotageManager) {
    const on = (id: string, action: () => void): void => {
      element(id).addEventListener('click', () => {
        action();
        element('game-container').focus({ preventScroll: true });
      }, { signal: this.controller.signal });
    };
    on('start-run', actions.start);
    on('next-wave', actions.start);
    on('try-again', actions.restart);
    on('new-run', actions.restart);
    on('pause', actions.pause);
    on('resume', actions.pause);
    on('fullscreen', actions.fullscreen);
    for (const upgrade of ['damage', 'attackSpeed', 'movementSpeed'] as const) on(`buy-${upgrade}`, () => actions.buy(upgrade));
  }

  render(run: Run, paused: boolean): void {
    const menu = paused ? 'paused' : run.phase;
    const signature = [menu, run.wave, run.health, run.scrap, run.kills, Math.ceil(run.remainingMs / 1000), run.purchased, this.sabotage.revision].join('|');
    if (signature === this.previous) return;
    this.previous = signature;
    element('game-container').dataset.phase = menu;
    element('hud').hidden = run.phase === 'ready';
    element('health-value').textContent = `${Math.ceil(run.health)} / ${run.maxHealth}`;
    element('wave-value').textContent = String(run.wave + 1);
    const seconds = Math.ceil(run.remainingMs / 1000);
    element('time-value').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    element('scrap-value').textContent = String(Math.round(run.scrap * 100) / 100);
    element('kills-value').textContent = String(run.kills);
    element('game-menu').hidden = !paused && (run.phase === 'playing' || run.phase === 'settling');
    for (const state of ['ready', 'shop', 'lost', 'paused']) element(`panel-${state}`).hidden = state !== menu;
    const pause = element<HTMLButtonElement>('pause');
    pause.disabled = run.phase !== 'playing';
    pause.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
    pause.title = paused ? 'Resume (Esc)' : 'Pause (Esc)';
    pause.setAttribute('aria-pressed', String(paused));
    element<HTMLButtonElement>('new-run').disabled = false;
    element('scene-status').textContent = paused ? 'Paused' : {
      ready: 'Ready', playing: `Wave ${run.wave + 1}`,
      settling: 'Collecting scrap…', shop: `Wave ${run.wave + 1} complete`,
      lost: 'Run ended',
    }[run.phase];
    element('next-wave').textContent = `Start wave ${run.wave + 2}`;
    element('shop-wallet').textContent = `${run.scrap} scrap`;
    element('shop-status').textContent = run.purchased ? 'Upgrade purchased' : '';
    for (const upgrade of ['damage', 'attackSpeed', 'movementSpeed'] as const) {
      const button = element<HTMLButtonElement>(`buy-${upgrade}`);
      button.disabled = run.phase !== 'shop' || Boolean(run.purchased) || run.scrap < run.upgradeCost || run.maxed(upgrade);
      button.dataset.selected = String(run.purchased === upgrade);
      button.querySelector('.price')!.textContent = run.purchased === upgrade ? 'Purchased' : run.maxed(upgrade) ? 'Max level' : `${run.upgradeCost} scrap`;
    }
    element('lost-summary').textContent = `Wave ${run.wave + 1} · ${run.kills} robots defeated · ${run.earned} scrap salvaged`;
    for (const id of ['ready-changes', 'shop-changes']) {
      const box = element(id);
      box.replaceChildren();
      const queued = this.sabotage.queued;
      box.hidden = !queued;
      if (queued) {
        const heading = document.createElement('strong');
        heading.textContent = `Changes for wave ${queued.wave}: ${queued.data.name}`;
        const list = document.createElement('ul');
        for (const change of describeRuleset(queued.data)) { const row = document.createElement('li'); row.textContent = change; list.append(row); }
        box.append(heading, list);
      }
    }
    const active = element('active-changes');
    active.hidden = !this.sabotage.active;
    element('active-name').textContent = this.sabotage.active ? `${this.sabotage.active.data.name} · this wave` : '';
    element('active-description').textContent = this.sabotage.active ? describeRuleset(this.sabotage.active.data).join(' ') : '';
  }

  setFullscreen(active: boolean, supported: boolean): void {
    const button = element<HTMLButtonElement>('fullscreen');
    button.disabled = !supported;
    button.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Fullscreen');
    button.setAttribute('aria-pressed', String(active));
    element('fullscreen-status').textContent = '';
    button.title = supported ? (active ? 'Exit fullscreen' : 'Fullscreen') : 'Fullscreen unavailable';
  }

  fullscreenFailed(): void { element('fullscreen-status').textContent = 'Could not open fullscreen. Try the button again.'; }

  destroy(): void { this.controller.abort(); }
}
