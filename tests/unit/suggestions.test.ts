import { expect, it } from 'vitest';
import { SuggestionInbox } from '../../server/suggestions';
import { InboxSchema, type GameContext, type NormalizedChat } from '../../src/shared/chat';

const game: GameContext = { instanceId: '12345678-1234-4234-9234-123456789abc', runId: 1, wave: 1, phase: 'playing', paused: false };
const chat = (id: string, text = 'Make defeated robots explode'): NormalizedChat => ({ id, text, viewerId: id, viewer: `Viewer${id}`, source: 'twitch' });
function fixture() { let now = 1000; return { inbox: new SuggestionInbox(() => now), advance: (ms = 2500) => { now += ms; } }; }

it('collects plain suggestions for N+1, freezes at wave end and retains two bounded batches', () => {
  const { inbox, advance } = fixture();
  expect(inbox.accept(chat('one'), game)).toBe(true);
  expect(inbox.snapshot().batches[0]).toMatchObject({ targetWave: 2, state: 'collecting' });
  inbox.setContext({ ...game, phase: 'settling' });
  expect(inbox.accept(chat('late'), { ...game, phase: 'shop' })).toBe(false);
  expect(inbox.snapshot().batches[0].state).toBe('ready');
  advance(); expect(inbox.accept(chat('two'), { ...game, wave: 2 })).toBe(true);
  expect(inbox.snapshot().batches.map(batch => batch.targetWave)).toEqual([2, 3]);
  inbox.setContext({ ...game, wave: 3 });
  expect(inbox.snapshot().batches.map(batch => batch.targetWave)).toEqual([3]);
  expect(inbox.snapshot().batches[0].state).toBe('ready');
  expect(InboxSchema.safeParse(inbox.snapshot()).success).toBe(true);
});

it('ignores commands and malformed input, deduplicates delivery and enforces viewer/global throttles', () => {
  const { inbox, advance } = fixture();
  for (const text of ['!spawn', '   ', 'a'.repeat(501)]) expect(inbox.accept(chat(text.slice(0, 20), text), game)).toBe(false);
  expect(inbox.accept(chat('a'), game)).toBe(true);
  expect(inbox.accept(chat('a'), game)).toBe(false);
  expect(inbox.accept({ ...chat('new'), viewerId: 'a' }, game)).toBe(false);
  expect(inbox.accept(chat('b'), game)).toBe(true); expect(inbox.accept(chat('c'), game)).toBe(true);
  expect(inbox.accept(chat('d'), game)).toBe(false);
  advance(10_000); expect(inbox.accept({ ...chat('later'), viewerId: 'a' }, game)).toBe(true);
  expect(inbox.snapshot().batches[0].suggestions).toHaveLength(4);
});

it('caps a batch at 20 and clears previous-run/dead-player suggestions', () => {
  const { inbox, advance } = fixture();
  for (let index = 0; index < 25; index++) { expect(inbox.accept(chat(String(index)), game)).toBe(index < 20); advance(); }
  expect(inbox.snapshot().batches[0].suggestions).toHaveLength(20);
  inbox.setContext({ ...game, runId: 2 }); expect(inbox.snapshot().batches).toEqual([]);
  expect(inbox.accept(chat('fresh'), { ...game, runId: 2, paused: true })).toBe(true);
  inbox.setContext({ ...game, runId: 2, phase: 'lost' }); expect(inbox.snapshot().batches).toEqual([]);
  expect(inbox.accept(chat('dead'), { ...game, runId: 2, phase: 'lost' })).toBe(false);
});

it('does not replay messages from a prior run or expose a mutable inbox', () => {
  const { inbox, advance } = fixture(); inbox.accept(chat('one'), game);
  const copy = inbox.snapshot(); copy.batches[0].suggestions.length = 0;
  expect(inbox.snapshot().batches[0].suggestions).toHaveLength(1);
  advance(20_000); inbox.setContext({ ...game, runId: 2 });
  expect(inbox.accept(chat('one'), { ...game, runId: 2 })).toBe(false);
  inbox.clear(); expect(inbox.snapshot().batches).toEqual([]);
});
