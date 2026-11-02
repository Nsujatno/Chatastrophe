import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthError, CHAT_SCOPE, EventSub, TwitchAuth, normalizeChat } from '../../server/twitch';
import { configFromEnvironment } from '../../server/config';

const config = () => configFromEnvironment({ TWITCH_CLIENT_ID: 'fixture-client', TWITCH_CLIENT_SECRET: 'fixture-secret' });
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const user = { client_id: 'fixture-client', user_id: '1234', login: 'fixture_streamer', scopes: [CHAT_SCOPE] };
const chat = { broadcaster_user_id: '1234', chatter_user_id: '55', chatter_user_name: 'Viewer', message_id: 'message-1', message: { text: 'Make robots explode' } };
class MockSocket extends EventTarget {
  closed = false;
  constructor(readonly url: string) { super(); }
  message(type: string, payload: unknown, id = `${type}-${Math.random()}`) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ metadata: { message_type: type, message_id: id }, payload }) })); }
  close() { if (!this.closed) { this.closed = true; this.dispatchEvent(new Event('close')); } }
}
afterEach(() => vi.useRealTimers());

describe('server-only Twitch authorization', () => {
  it('exchanges and validates a code using the registered callback and read-only scope', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input); calls.push({ url, init });
      return url.endsWith('/token') ? reply({ access_token: 'fixture-access', refresh_token: 'fixture-refresh' }) : reply(user);
    });
    const auth = new TwitchAuth(config(), request);
    await auth.exchange('fixture-code');
    expect(auth.user).toEqual({ id: '1234', login: 'fixture_streamer' });
    expect(String(calls[0].init?.body)).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Fapi%2Ftwitch%2Fcallback');
    expect(calls[1].init?.headers).toEqual({ Authorization: 'OAuth fixture-access' });
  });

  it('refreshes expired tokens once and uses the replacement for subscriptions', async () => {
    let tokenCalls = 0; let validationCalls = 0;
    const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/token')) { tokenCalls++; return reply({ access_token: `access-${tokenCalls}`, refresh_token: `refresh-${tokenCalls}` }); }
      if (url.endsWith('/validate')) { validationCalls++; return validationCalls === 2 ? reply({}, 401) : reply(user); }
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer access-2' });
      expect(JSON.parse(String(init?.body))).toMatchObject({ type: 'channel.chat.message', condition: { broadcaster_user_id: '1234', user_id: '1234' }, transport: { session_id: 'ws-session' } });
      return reply({}, 202);
    });
    const auth = new TwitchAuth(config(), request);
    await auth.exchange('code'); await auth.validate(); await auth.subscribe('ws-session');
    expect(tokenCalls).toBe(2);
  });

  it('rejects wrong clients, missing scope and invalid refreshes', async () => {
    for (const response of [{ ...user, client_id: 'wrong' }, { ...user, scopes: [] }]) {
      const auth = new TwitchAuth(config(), async input => String(input).endsWith('/token') ? reply({ access_token: 'a', refresh_token: 'r' }) : reply(response));
      await expect(auth.exchange('code')).rejects.toBeInstanceOf(AuthError);
    }
    let calls = 0;
    const auth = new TwitchAuth(config(), async input => {
      if (String(input).endsWith('/token')) return ++calls === 1 ? reply({ access_token: 'a', refresh_token: 'r' }) : reply({}, 400);
      return reply({}, 401);
    });
    await expect(auth.exchange('code')).rejects.toBeInstanceOf(AuthError);
    auth.clear(); await expect(auth.subscribe('id')).rejects.toBeInstanceOf(AuthError);
  });
});

describe('EventSub transport', () => {
  it('normalizes only messages from the authorized broadcaster, including shared-chat filtering', () => {
    expect(normalizeChat(chat, '1234', 'twitch')).toMatchObject({ text: 'Make robots explode', viewerId: '55', source: 'twitch' });
    for (const input of [{ ...chat, broadcaster_user_id: 'other' }, { ...chat, source_broadcaster_user_id: 'other' }, { ...chat, message: { text: 'x'.repeat(501) } }, {}]) expect(normalizeChat(input, '1234', 'twitch')).toBeUndefined();
  });

  it('subscribes on welcome, transfers reconnects without resubscribing and ignores duplicate controls', async () => {
    const sockets: MockSocket[] = []; const subscribe = vi.fn(async () => {}); const messages: unknown[] = []; const statuses: string[] = [];
    const wire = new EventSub({ url: 'wss://eventsub.wss.twitch.tv/ws', broadcasterId: '1234', source: 'twitch', subscribe, status: s => statuses.push(s.state), chat: c => messages.push(c), socket: url => { const socket = new MockSocket(url); sockets.push(socket); return socket as unknown as WebSocket; } });
    wire.start(); sockets[0].message('session_welcome', { session: { id: 'first', keepalive_timeout_seconds: 10 } });
    await Promise.resolve(); await Promise.resolve();
    sockets[0].message('notification', { subscription: { type: 'channel.chat.message', version: '1' }, event: chat });
    expect(messages).toHaveLength(1); expect(subscribe).toHaveBeenCalledTimes(1);
    sockets[0].message('session_reconnect', { session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?handoff=1' } }, 'handoff');
    sockets[0].message('session_reconnect', { session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?handoff=1' } }, 'handoff');
    expect(sockets).toHaveLength(2); expect(sockets[0].closed).toBe(false);
    sockets[1].message('session_welcome', { session: { id: 'second', keepalive_timeout_seconds: 10 } });
    expect(sockets[0].closed).toBe(true); expect(subscribe).toHaveBeenCalledTimes(1);
    sockets[0].message('notification', { subscription: { type: 'channel.chat.message', version: '1' }, event: { ...chat, message_id: 'old' } });
    expect(messages).toHaveLength(1); expect(statuses).toContain('connected');
    wire.stop();
  });

  it('reconnects after silence and cleans up every timer and socket on stop', async () => {
    vi.useFakeTimers(); const sockets: MockSocket[] = [];
    const wire = new EventSub({ url: 'wss://eventsub.wss.twitch.tv/ws', broadcasterId: '1234', source: 'twitch', subscribe: async () => {}, status: () => {}, chat: () => {}, socket: url => { const socket = new MockSocket(url); sockets.push(socket); return socket as unknown as WebSocket; } });
    wire.start(); sockets[0].message('session_welcome', { session: { id: 'first', keepalive_timeout_seconds: 10 } });
    await Promise.resolve(); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(12_500);
    expect(sockets[0].closed).toBe(true); expect(sockets.length).toBeGreaterThan(1);
    wire.stop(); const count = sockets.length;
    await vi.advanceTimersByTimeAsync(60_000); expect(sockets).toHaveLength(count); expect(vi.getTimerCount()).toBe(0);
  });

  it('stops when access is revoked and rejects reconnect destinations outside Twitch', async () => {
    const sockets: MockSocket[] = []; const statuses: string[] = [];
    const wire = new EventSub({ url: 'wss://eventsub.wss.twitch.tv/ws', broadcasterId: '1234', source: 'twitch', subscribe: async () => {}, status: s => statuses.push(s.state), chat: () => {}, socket: url => { const socket = new MockSocket(url); sockets.push(socket); return socket as unknown as WebSocket; } });
    wire.start(); sockets[0].message('session_welcome', { session: { id: 'first', keepalive_timeout_seconds: 10 } }); await Promise.resolve(); await Promise.resolve();
    sockets[0].message('revocation', { subscription: { status: 'authorization_revoked' } });
    expect(statuses.at(-1)).toBe('auth-required'); expect(sockets[0].closed).toBe(true);
    expect(wire['validReconnect']('wss://evil.example/ws')).toBe(false);
    expect(wire['validReconnect']('ws://127.0.0.1/ws')).toBe(false);
  });
});
