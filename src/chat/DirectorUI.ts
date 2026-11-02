import { summarizeRuleset } from '../shared/rules';
import type { DirectorState } from '../shared/director';
import type { GameContext } from '../shared/chat';
import type { SabotageManager } from '../game/rules/SabotageManager';

interface Context { manager: SabotageManager; phase: GameContext['phase']; hold(held: boolean): void }
export class DirectorUI {
  private root = document.createElement('section');
  private status = document.createElement('p');
  private state?: DirectorState;
  private signature = '';
  private applied = '';
  private dismissed = '';
  private controller = new AbortController();

  constructor(private current: () => Context | undefined, private skip: () => void) {
    this.root.id = 'director-overlay'; this.root.className = 'director-overlay'; this.root.hidden = true;
    this.root.setAttribute('aria-label', 'AI Director chat vote');
    this.status.id = 'director-status'; this.status.className = 'director-status'; this.status.hidden = true;
    document.querySelector('.stage')!.append(this.root);
    document.getElementById('game-shell')!.append(this.status);
    this.root.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest('button');
      if (button?.dataset.action === 'skip') this.cancel();
      if (button?.dataset.action === 'continue') { this.dismissed = this.key(); this.sync(); }
    }, { signal: this.controller.signal });
    this.status.addEventListener('click', event => {
      if (!(event.target as HTMLElement).closest('button')) return;
      if (this.current()?.manager.active) { this.current()!.manager.clear(); this.sync(); }
      else this.cancel();
    }, { signal: this.controller.signal });
  }
  receive(state: DirectorState | null): void { this.state = state ?? undefined; this.signature = ''; this.sync(); }
  get voting(): boolean { return this.state?.state === 'voting'; }
  statusFor(wave: number): string | undefined {
    if (!this.state || this.state.targetWave !== wave || this.state.state === 'collecting') return undefined;
    return {
      generating: 'AI Director is creating choices…', voting: 'Chat vote open · type 1, 2, or 3',
      complete: this.state.winner === null ? 'No votes · no chat changes' : 'Winner queued for the next wave',
      skipped: 'No chat changes this wave', error: 'AI unavailable · the game can continue',
    }[this.state.state];
  }
  private key(): string { return this.state ? `${this.state.instanceId}:${this.state.runId}:${this.state.targetWave}` : ''; }
  private cancel(): void {
    const context = this.current();
    if (context) { context.manager.clear(); context.manager.discardQueue(); context.hold(false); }
    this.applied = this.key(); this.dismissed = this.key(); this.skip();
    this.state = undefined; this.signature = ''; this.sync();
  }
  sync(): void {
    const context = this.current(); const state = this.state;
    const valid = Boolean(context && state && state.runId === context.manager.runId && state.targetWave >= context.manager.wave && context.phase !== 'lost');
    const beforeWave = valid && context!.phase === 'shop' && state!.targetWave === context!.manager.wave + 1;
    const busy = Boolean(beforeWave && (state!.state === 'generating' || state!.state === 'voting' || (state!.state === 'collecting' && state!.messageCount > 0)));
    context?.hold(busy);
    const next = document.getElementById('next-wave') as HTMLButtonElement;
    next.disabled = busy;
    if (beforeWave && state!.state === 'complete' && state!.winner !== null && this.applied !== this.key()) {
      this.applied = this.key();
      if (!context!.manager.queue(state!.options[state!.winner], { runId: state!.runId, wave: state!.targetWave })) {
        this.dismissed = this.key();
      }
    }
    const remaining = Math.max(0, Math.ceil(((state?.deadline ?? 0) - Date.now()) / 1000));
    const signature = JSON.stringify([state, context?.phase, context?.manager.wave, context?.manager.active?.data.id, remaining, this.dismissed]);
    if (signature === this.signature) return;
    this.signature = signature;
    const show = beforeWave && (busy || state!.state === 'complete') && this.dismissed !== this.key();
    this.root.hidden = !show;
    this.root.dataset.state = valid ? state!.state : 'idle';
    this.status.hidden = !valid;
    this.status.replaceChildren();
    if (!valid) return;
    const summary = document.createElement('span');
    summary.textContent = state!.state === 'collecting' ? `Chat is plotting… ${state!.messageCount} ${state!.messageCount === 1 ? 'message' : 'messages'} collected for wave ${state!.targetWave}.`
      : state!.state === 'voting' ? `Chat vote · ${remaining}s left · type 1, 2, or 3`
        : state!.detail;
    this.status.append(summary);
    if ((beforeWave && state!.winner !== null) || context!.manager.active) {
      const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'Cancel chat changes'; this.status.append(clear);
    }
    if (!show) return;
    this.root.replaceChildren();
    const panel = document.createElement('div'); panel.className = 'director-panel';
    const eyebrow = document.createElement('p'); eyebrow.className = 'director-eyebrow';
    eyebrow.textContent = `AI DIRECTOR${state!.source === 'mock' ? ' · LOCAL TEST CHAT' : ''} · WAVE ${state!.targetWave}`;
    const title = document.createElement('h2'); title.id = 'director-title';
    title.textContent = state!.state === 'voting' ? `Chat decides · ${remaining}s` : state!.state === 'complete' ? (state!.winner === null ? 'No votes · no changes' : `${state!.options[state!.winner].name} wins!`) : 'Chat is plotting…';
    const detail = document.createElement('p'); detail.id = 'director-detail'; detail.textContent = state!.detail;
    panel.append(eyebrow, title, detail);
    if (state!.options.length) {
      const choices = document.createElement('div'); choices.className = 'director-choices';
      for (const [index, option] of state!.options.entries()) {
        const card = document.createElement('article'); card.className = 'director-option'; card.dataset.winner = String(state!.winner === index);
        const label = document.createElement('strong'); label.textContent = `${index + 1} · ${option.name}`;
        const description = document.createElement('ul');
        for (const summary of summarizeRuleset(option)) {
          const bullet = document.createElement('li'); bullet.textContent = summary; description.append(bullet);
        }
        const votes = document.createElement('b'); votes.className = 'director-votes'; votes.textContent = `${state!.votes[index]} ${state!.votes[index] === 1 ? 'vote' : 'votes'}`;
        card.append(label, description, votes); choices.append(card);
      }
      panel.append(choices);
    }
    const lifetime = document.createElement('p'); lifetime.className = 'director-lifetime';
    const explosions = state!.options.some(option => option.rules.some(rule => rule.actions.some(action => action.type === 'explode')));
    lifetime.textContent = `Wave ${state!.targetWave} only · expires at wave end${explosions ? ' · explosions can hurt you too' : ''}`;
    const button = document.createElement('button'); button.type = 'button'; button.dataset.action = busy ? 'skip' : 'continue';
    button.textContent = busy ? 'Skip vote' : 'Continue to upgrades'; button.className = 'primary';
    panel.append(lifetime, button); this.root.append(panel);
  }
  destroy(): void { this.current()?.hold(false); this.controller.abort(); this.root.remove(); this.status.remove(); }
}
