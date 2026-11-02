import { CHAT_LIMITS, type GameContext, type NormalizedChat, type InboxSnapshot, type SuggestionBatch } from '../src/shared/chat.ts';

export class SuggestionInbox {
  private seen = new Map<string, number>();
  private users = new Map<string, number>();
  private tokens: number = CHAT_LIMITS.burst;
  private last: number;
  private scope?: { instanceId: string; runId: number };
  private batches: SuggestionBatch[] = [];
  private now: () => number;
  constructor(now = Date.now) { this.now = now; this.last = now(); }
  setContext(game: GameContext): void {
    if (this.scope?.instanceId !== game.instanceId || this.scope.runId !== game.runId) {
      this.batches = []; this.scope = { instanceId: game.instanceId, runId: game.runId };
    }
    if (game.phase === 'lost') { this.batches = []; return; }
    for (const batch of this.batches) if (batch.targetWave <= game.wave || (game.phase !== 'playing' && batch.targetWave === game.wave + 1)) batch.state = 'ready';
    this.batches = this.batches.filter(batch => batch.targetWave >= game.wave && batch.targetWave <= game.wave + 1).slice(-CHAT_LIMITS.batches);
  }
  accept(chat: NormalizedChat, game: GameContext): boolean {
    this.setContext(game);
    const now = this.now();
    for (const [id, at] of this.seen) if (now - at > CHAT_LIMITS.seenMs) this.seen.delete(id);
    for (const [id, at] of this.users) if (now - at >= CHAT_LIMITS.userCooldownMs) this.users.delete(id);
    const id = `${chat.source}:${chat.id}`;
    if (!chat.id || chat.id.length > 128 || this.seen.has(id)) return false;
    this.seen.set(id, now);
    if (this.seen.size > CHAT_LIMITS.seenMessages) this.seen.delete(this.seen.keys().next().value!);
    const text = chat.text.trim();
    if (game.phase !== 'playing' || game.wave >= Number.MAX_SAFE_INTEGER || !text || text.startsWith('!') || text.length > CHAT_LIMITS.text || !chat.viewerId || !chat.viewer || chat.viewer.length > 50) return false;
    let batch = this.batches.find(batch => batch.targetWave === game.wave + 1);
    if (batch && (batch.state !== 'collecting' || batch.suggestions.length >= CHAT_LIMITS.suggestionsPerWave)) return false;
    this.tokens = Math.min(CHAT_LIMITS.burst, this.tokens + (now - this.last) / CHAT_LIMITS.refillMs); this.last = now;
    const user = `${chat.source}:${chat.viewerId}`;
    if (this.users.has(user) || this.tokens < 1) return false;
    this.users.set(user, now); this.tokens--;
    if (!batch) { batch = { targetWave: game.wave + 1, state: 'collecting', suggestions: [] }; this.batches.push(batch); }
    batch.suggestions.push({ id, text, viewer: chat.viewer, source: chat.source, receivedAt: now });
    return true;
  }
  clear(): void { this.batches = []; }
  snapshot(): InboxSnapshot { return structuredClone({ ...this.scope, batches: this.batches }); }
}
