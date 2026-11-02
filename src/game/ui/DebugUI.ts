import { PRESETS } from '../rules/presets';
import type { SabotageManager } from '../rules/SabotageManager';
import { parseRuleset } from '../../shared/rules';

interface Actions { pauseForInput(): void; releaseInput(): void; clear(): void; advance(): void; changed(): void }

export class DebugUI {
  private root = document.createElement('details');
  private editor = document.createElement('textarea');
  private output = document.createElement('pre');
  private inspection = document.createElement('pre');
  private previous = '';
  private controller = new AbortController();

  constructor(private manager: SabotageManager, private actions: Actions) {
    this.root.id = 'sabotage-debug';
    this.root.className = 'sabotage-debug';
    const summary = document.createElement('summary');
    summary.textContent = 'Test modifiers · presets and custom rules';
    this.root.append(summary);
    const note = document.createElement('p');
    note.textContent = 'These are manual tests. Choose a preset, then click “Use next wave.” Editing pauses the game. The AI Director collects chat during waves and opens a 30-second vote between waves.';
    this.root.append(note);
    const presets = document.createElement('div');
    presets.className = 'debug-actions';
    for (const preset of PRESETS) this.button(presets, preset.name, () => {
      this.editor.value = JSON.stringify(preset, null, 2);
      this.preview(false);
    });
    this.root.append(presets);
    const label = document.createElement('label');
    label.htmlFor = 'rule-json'; label.textContent = 'Edit custom rules (JSON)';
    this.editor.id = 'rule-json'; this.editor.spellcheck = false;
    this.editor.setAttribute('aria-describedby', 'rule-feedback');
    this.editor.addEventListener('focus', actions.pauseForInput, { signal: this.controller.signal });
    this.editor.addEventListener('blur', actions.releaseInput, { signal: this.controller.signal });
    this.root.append(label, this.editor);
    const controls = document.createElement('div');
    controls.className = 'debug-actions';
    this.button(controls, 'Check rules', () => this.preview(false));
    this.button(controls, 'Use next wave', () => this.preview(true));
    this.button(controls, 'Stop current changes', actions.clear);
    this.button(controls, 'Remove next-wave changes', () => { manager.discardQueue(); actions.changed(); });
    this.button(controls, 'Finish this wave', actions.advance);
    this.output.id = 'rule-feedback'; this.output.setAttribute('role', 'status');
    this.inspection.id = 'rule-inspection';
    const inspection = document.createElement('details');
    const inspectLabel = document.createElement('summary'); inspectLabel.textContent = 'Inspect test data';
    inspection.append(inspectLabel, this.inspection);
    this.root.append(controls, this.output, inspection);
    document.getElementById('developer-tools')!.append(this.root);
    this.editor.value = JSON.stringify(PRESETS[0], null, 2);
    this.preview(false);
  }

  private button(parent: HTMLElement, text: string, action: () => void): void {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = text;
    button.addEventListener('click', action, { signal: this.controller.signal });
    parent.append(button);
  }

  private preview(queue: boolean): void {
    const parsed = parseRuleset(this.editor.value);
    if (!parsed.ok) { this.output.textContent = parsed.errors.join('\n'); return; }
    const result = this.manager.preview(parsed.data);
    if (!result.ok) { this.output.textContent = result.errors.join('\n'); return; }
    const queued = queue && this.manager.queue(result.data);
    this.output.textContent = `${queued ? `Ready for wave ${this.manager.wave + 1}` : 'Preview'} · ${result.data.name}\n${result.changes.join('\n')}`;
    this.actions.changed();
  }

  render(): void {
    const manager = this.manager;
    const signature = [manager.revision, Math.ceil(manager.remainingMs / 1000), manager.modifiers.size, manager.pendingCount, manager.blocked].join('|');
    if (signature === this.previous) return;
    this.previous = signature;
    this.inspection.textContent = `Active: ${manager.active?.data.name ?? 'none'} · wave ${manager.wave} · ${Math.ceil(manager.remainingMs / 1000)}s left\nQueued: ${manager.queued?.data.name ?? 'none'}${manager.queued ? ` → wave ${manager.queued.wave}` : ''}\nModifiers: ${manager.modifiers.size} · Warnings: ${manager.pendingCount} · Subscriptions: ${manager.listenerCount} · Budget denials: ${manager.blocked}\n${JSON.stringify({ effects: manager.modifiers.inspect(manager.now), warnings: manager.inspectPending(), active: manager.active?.data ?? null, queued: manager.queued?.data ?? null }, null, 2)}`;
  }

  destroy(): void { this.actions.releaseInput(); this.controller.abort(); this.root.remove(); }
}
