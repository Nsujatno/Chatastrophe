import type { Run, Upgrade } from '../systems/run';

const element = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

export class GameUI {
  private controller = new AbortController();
  private previous = '';

  constructor(actions: { start: () => void; restart: () => void; pause: () => void; buy: (upgrade: Upgrade) => void }) {
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
    for (const upgrade of ['damage', 'attackSpeed', 'movementSpeed'] as const) on(`buy-${upgrade}`, () => actions.buy(upgrade));
  }

  render(run: Run, paused: boolean): void {
    const menu = paused ? 'paused' : run.phase;
    const signature = [menu, run.wave, run.health, run.scrap, run.kills, Math.ceil(run.remainingMs / 1000), run.purchased].join('|');
    if (signature === this.previous) return;
    this.previous = signature;
    element('game-container').dataset.phase = menu;
    element('hud').hidden = run.phase === 'ready';
    element('health-value').textContent = `${run.health} / ${run.maxHealth}`;
    element<HTMLProgressElement>('health-bar').value = run.health;
    element('wave-value').textContent = `${run.wave + 1} / 3`;
    const seconds = Math.ceil(run.remainingMs / 1000);
    element('time-value').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    element('scrap-value').textContent = String(run.scrap);
    element('kills-value').textContent = String(run.kills);
    element('game-menu').hidden = !paused && (run.phase === 'playing' || run.phase === 'settling');
    for (const state of ['ready', 'shop', 'lost', 'won', 'paused']) element(`panel-${state}`).hidden = state !== menu;
    const pause = element<HTMLButtonElement>('pause');
    pause.disabled = run.phase !== 'playing';
    pause.textContent = paused ? 'Resume' : 'Pause';
    pause.setAttribute('aria-pressed', String(paused));
    element<HTMLButtonElement>('new-run').disabled = false;
    element('scene-status').textContent = paused ? 'Run paused' : {
      ready: 'Yard ready · standalone play', playing: `Wave ${run.wave + 1} · keep moving`,
      settling: 'Wave survived · banking scrap…', shop: 'Repairs complete · choose an upgrade',
      lost: 'Scavenger offline · try again', won: 'Yard cleared · you made it',
    }[run.phase];
    element('next-wave').textContent = `Start wave ${run.wave + 2} →`;
    element('shop-wallet').textContent = `${run.scrap} scrap available`;
    element('shop-status').textContent = run.purchased ? 'Upgrade fitted. Ready when you are.' : 'Buy one upgrade, or save your scrap and continue.';
    for (const upgrade of ['damage', 'attackSpeed', 'movementSpeed'] as const) {
      const button = element<HTMLButtonElement>(`buy-${upgrade}`);
      button.disabled = run.phase !== 'shop' || Boolean(run.purchased) || run.scrap < run.upgradeCost;
      button.dataset.selected = String(run.purchased === upgrade);
      button.querySelector('.price')!.textContent = run.purchased === upgrade ? 'FITTED ✓' : `${run.upgradeCost} scrap`;
    }
    for (const state of ['lost', 'won']) {
      element(`${state}-summary`).textContent = `Wave ${run.wave + 1} · ${run.kills} robots defeated · ${run.earned} scrap salvaged`;
    }
  }

  destroy(): void { this.controller.abort(); }
}
