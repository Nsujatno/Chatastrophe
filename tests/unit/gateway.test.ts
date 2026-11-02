import { afterEach, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { createGateway } from '../../server/gateway';
import { configFromEnvironment } from '../../server/config';
import { CHAT_SCOPE } from '../../server/twitch';
import { CHAT_LIMITS, type ChatMessage, type InboxSnapshot } from '../../src/shared/chat';
import type { GenerateRules } from '../../server/director';
import type { DirectorState } from '../../src/shared/director';
import { DIRECTOR_FIXTURES } from '../helpers/director';

const cleanup: (() => Promise<unknown> | void)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function fixture(generate?: GenerateRules) {
  let now = Date.now();
  const config = configFromEnvironment({ MOCK_CHAT: 'true', TWITCH_CLIENT_ID: 'fixture-client', TWITCH_CLIENT_SECRET: 'fixture-private' });
  const request: typeof fetch = async input => String(input).endsWith('/token') ? new Response(JSON.stringify({ access_token: 'fixture-access', refresh_token: 'fixture-refresh' })) : new Response(JSON.stringify({ client_id: 'fixture-client', user_id: '1234', login: 'fixture_channel', scopes: [CHAT_SCOPE] }));
  const gateway = createGateway(config, { now: () => now, request, generate });
  await new Promise<void>(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  config.origin = `http://127.0.0.1:${(gateway.server.address() as AddressInfo).port}`;
  cleanup.push(() => gateway.close());
  const session = async () => {
    const response = await fetch(`${config.origin}/api/session`);
    return { data: await response.json() as { csrf: string; sessionId: string }, cookie: response.headers.get('set-cookie')!.split(';')[0], cookieHeader: response.headers.get('set-cookie')! };
  };
  return { config, gateway, session, advance: (ms: number) => { now += ms; } };
}
async function connect(origin: string, csrf: string, cookie: string, listen?: (socket: Socket) => void): Promise<Socket> {
  const socket = io(origin, { transports: ['websocket'], auth: { csrf }, extraHeaders: { Origin: origin, Cookie: cookie }, reconnection: false, forceNew: true });
  cleanup.push(() => { socket.disconnect(); });
  listen?.(socket);
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return socket;
}
const state = () => ({ instanceId: '12345678-1234-4234-9234-123456789abc', runId: 1, wave: 1, phase: 'playing', paused: false });
const tick = () => new Promise(resolve => setTimeout(resolve, 25));

it('turns a full round of chat into session-isolated options and counts authenticated live votes', async () => {
  let inputMessages: string[] = [];
  const f = await fixture(async ({ messages }) => { inputMessages = messages.map(message => message.text); return DIRECTOR_FIXTURES; });
  const a = await f.session(); const b = await f.session();
  const one = await connect(f.config.origin, a.data.csrf, a.cookie); const two = await connect(f.config.origin, b.data.csrf, b.cookie);
  let director: DirectorState | null = null; let other: DirectorState | null = null;
  one.on('director:state', value => { director = value; }); two.on('director:state', value => { other = value; });
  const post = (text: string, viewer = 'alice') => fetch(f.config.origin + '/api/mock/message', { method: 'POST', headers: { Origin: f.config.origin, Cookie: a.cookie, 'X-CSRF-Token': a.data.csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ viewer, text }) });
  await fetch(f.config.origin + '/api/mock/connect', { method: 'POST', headers: { Origin: f.config.origin, Cookie: a.cookie, 'X-CSRF-Token': a.data.csrf } });
  one.emit('game:state', state()); await tick();
  for (const idea of ['Exploding robots', 'Faster shots', 'Tiny reinforcements']) await post(idea);
  expect(inputMessages).toEqual([]);
  one.emit('game:state', { ...state(), phase: 'shop' }); await tick();
  expect(inputMessages).toEqual(['Exploding robots', 'Faster shots', 'Tiny reinforcements']);
  expect(director).toMatchObject({ state: 'voting', targetWave: 2, source: 'mock', votes: [0, 0, 0] }); expect(other).toBeNull();
  await post('2'); await post('1'); await post('!vote 2', 'bob'); await tick();
  expect(director).toMatchObject({ votes: [0, 2, 0] });
  f.advance(30_001); one.emit('game:state', { ...state(), phase: 'shop' }); await tick();
  expect(director).toMatchObject({ state: 'complete', winner: 1 });
  expect(JSON.stringify(director)).not.toMatch(/fixture-private|fixture-access|fixture-refresh/);
  one.emit('game:state', { ...state(), runId: 2 }); await tick();
  expect(director).toMatchObject({ state: 'collecting', runId: 2, messageCount: 0 });
});

it('authenticates sockets and isolates next-wave suggestions without exposing OAuth credentials', async () => {
  const f = await fixture(); const a = await f.session(); const b = await f.session();
  expect(a.cookieHeader).toContain('HttpOnly'); expect(a.cookieHeader).toContain('SameSite=Lax'); expect(a.cookie).not.toBe(b.cookie);
  expect(JSON.stringify(a.data)).not.toMatch(/fixture-private|fixture-access|fixture-refresh/);
  const one = await connect(f.config.origin, a.data.csrf, a.cookie); const two = await connect(f.config.origin, b.data.csrf, b.cookie);
  let inbox: InboxSnapshot = { batches: [] }; let other: InboxSnapshot = { batches: [] };
  one.on('chat:suggestions', message => { inbox = message; }); two.on('chat:suggestions', message => { other = message; });
  one.emit('game:state', state()); two.emit('game:state', { ...state(), instanceId: 'aaaaaaaa-1234-4234-9234-123456789abc' }); await tick();
  const post = (path: string, data = {}) => fetch(f.config.origin + path, { method: 'POST', headers: { Origin: f.config.origin, Cookie: a.cookie, 'X-CSRF-Token': a.data.csrf, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  expect((await post('/api/mock/connect')).status).toBe(200);
  const ideas = ['Make robots explode', 'Send tiny backup robots', 'Give me faster shots', 'Make haulers stronger'];
  for (const [index, text] of ideas.entries()) {
    f.advance(2500);
    const response = await post('/api/mock/message', { viewer: `viewer${index}`, text });
    expect(await response.json()).toEqual({ accepted: true }); await tick();
  }
  expect(inbox.batches[0]).toMatchObject({ targetWave: 2, state: 'collecting' });
  expect(inbox.batches[0].suggestions.map(suggestion => suggestion.text)).toEqual(ideas);
  expect(inbox.batches[0].suggestions.every(suggestion => suggestion.source === 'mock')).toBe(true);
  expect(other.batches).toEqual([]);
  one.emit('game:state', { ...state(), phase: 'shop' }); await tick();
  expect(inbox.batches[0].state).toBe('ready');
  expect((await post('/api/mock/message', { viewer: 'fake', text: 'More robots', source: 'twitch' })).status).toBe(400);
  one.emit('game:state', { ...state(), runId: 2 }); await tick(); expect(inbox.batches).toEqual([]);
});

it('streams bounded chat outside combat, isolates history and clears it on disconnect', async () => {
  const f = await fixture(); const a = await f.session(); const b = await f.session();
  const messages: ChatMessage[] = []; const other: ChatMessage[] = [];
  const one = await connect(f.config.origin, a.data.csrf, a.cookie, socket => socket.on('chat:message', message => messages.push(message)));
  await connect(f.config.origin, b.data.csrf, b.cookie, socket => socket.on('chat:message', message => other.push(message)));
  const post = (path: string, data = {}) => fetch(f.config.origin + path, { method: 'POST', headers: { Origin: f.config.origin, Cookie: a.cookie, 'X-CSRF-Token': a.data.csrf, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  await post('/api/mock/connect');
  for (let index = 0; index < CHAT_LIMITS.history + 5; index++) {
    expect(await (await post('/api/mock/message', { viewer: 'viewer', text: `!hello ${index}` })).json()).toEqual({ accepted: false });
  }
  await tick();
  expect(messages).toHaveLength(CHAT_LIMITS.history + 5);
  expect(messages[0]).toMatchObject({ text: '!hello 0', viewer: 'viewer', source: 'mock' });
  expect(other).toEqual([]);
  one.disconnect(); await tick();
  let history: ChatMessage[] = [];
  await connect(f.config.origin, a.data.csrf, a.cookie, socket => socket.on('chat:history', value => { history = value; }));
  await tick();
  expect(history).toHaveLength(CHAT_LIMITS.history);
  expect(history[0].text).toBe('!hello 5');
  expect(history.at(-1)!.text).toBe(`!hello ${CHAT_LIMITS.history + 4}`);
  await post('/api/twitch/disconnect'); await tick();
  expect(history).toEqual([]);
});

it('rejects missing or cross-session credentials, wrong origins and unauthorized controls', async () => {
  const f = await fixture(); const a = await f.session(); const b = await f.session();
  await expect(connect(f.config.origin, b.data.csrf, a.cookie)).rejects.toThrow('Unauthorized');
  await expect(connect(f.config.origin, 'é'.repeat(a.data.csrf.length), a.cookie)).rejects.toThrow('Unauthorized');
  expect((await fetch(f.config.origin + '/api/mock/connect', { method: 'POST' })).status).toBe(403);
  expect((await fetch(f.config.origin + '/api/mock/connect', { method: 'POST', headers: { Origin: 'http://evil.example', Cookie: a.cookie, 'X-CSRF-Token': a.data.csrf } })).status).toBe(403);
  expect((await fetch(f.config.origin + '/api/mock/connect', { method: 'POST', headers: { Origin: f.config.origin, Cookie: a.cookie, 'X-CSRF-Token': b.data.csrf } })).status).toBe(403);
});

it('uses bound, expiring, single-use OAuth state and requests only chat reading', async () => {
  const f = await fixture(); const a = await f.session(); const b = await f.session();
  const authorize = await fetch(f.config.origin + '/api/twitch/connect', { method: 'POST', headers: { Origin: f.config.origin, Cookie: a.cookie, 'X-CSRF-Token': a.data.csrf } });
  const url = new URL((await authorize.json() as { url: string }).url);
  expect(url.origin).toBe('https://id.twitch.tv'); expect(url.searchParams.get('scope')).toBe('user:read:chat');
  expect(url.href).not.toContain('fixture-private');
  const callback = `${f.config.origin}/api/twitch/callback?state=${url.searchParams.get('state')}&code=fixture-code`;
  expect((await fetch(callback, { headers: { Cookie: b.cookie } })).status).toBe(400);
  f.advance(600_001);
  expect((await fetch(callback, { headers: { Cookie: a.cookie } })).status).toBe(400);
  expect((await fetch(f.config.origin + '/api/twitch/callback?state=wrong', { headers: { Cookie: a.cookie } })).status).toBe(400);
});

it('drops chat while the host is absent, restores the inbox on reconnect and replaces old tabs', async () => {
  const f = await fixture(); const a = await f.session();
  const old = await connect(f.config.origin, a.data.csrf, a.cookie); old.emit('game:state', state()); await tick();
  const post = (path: string, data = {}) => fetch(f.config.origin + path, { method: 'POST', headers: { Origin: f.config.origin, Cookie: a.cookie, 'X-CSRF-Token': a.data.csrf, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  await post('/api/mock/connect');
  await post('/api/mock/message', { viewer: 'first', text: 'Make defeated robots explode' }); old.disconnect(); await tick();
  expect(await (await post('/api/mock/message', { viewer: 'offline', text: 'More robots' })).json()).toEqual({ accepted: false });
  const fresh = await connect(f.config.origin, a.data.csrf, a.cookie); let inbox: InboxSnapshot = { batches: [] }; fresh.on('chat:suggestions', message => { inbox = message; });
  fresh.emit('game:state', state()); await tick(); expect(inbox.batches[0].suggestions).toHaveLength(1);
  fresh.emit('game:state', { ...state(), runId: 2 }); await tick(); expect(inbox.batches).toEqual([]);
  f.advance(2500); await post('/api/mock/message', { viewer: 'online', text: 'Faster robots' }); await tick(); expect(inbox.batches[0].suggestions).toHaveLength(1);
  await connect(f.config.origin, a.data.csrf, a.cookie); await tick(); expect(fresh.connected).toBe(false);
});
