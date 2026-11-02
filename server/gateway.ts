import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { Server } from 'socket.io';
import { z } from 'zod';
import { CHAT_LIMITS, GameContextSchema, type ChatStatus, type GameContext, type NormalizedChat } from '../src/shared/chat.ts';
import { SuggestionInbox } from './suggestions.ts';
import { AuthError, CHAT_SCOPE, EventSub, TwitchAuth } from './twitch.ts';
import type { ServerConfig } from './config.ts';

interface Session {
  id: string; csrf: string; touched: number; epoch: number; inbox: SuggestionInbox;
  status: ChatStatus; game?: GameContext; host?: string; state?: string; stateUntil?: number;
  auth?: TwitchAuth; wire?: EventSub; validateTimer?: ReturnType<typeof setInterval>;
}
const COOKIE = 'chatastrophe_session';
const random = () => randomBytes(32).toString('base64url');
const same = (a: unknown, b: string) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const MockSchema = z.object({ viewer: z.string().regex(/^[a-zA-Z0-9_]{1,25}$/), text: z.string().min(1).max(CHAT_LIMITS.text) }).strict();
export function createGateway(config: ServerConfig, dependencies: { request?: typeof fetch; now?: () => number; socket?: (url: string) => WebSocket } = {}) {
  const request = dependencies.request ?? fetch;
  const now = dependencies.now ?? Date.now;
  const sessions = new Map<string, Session>();
  const sessionFor = (req: IncomingMessage) => {
    const cookie = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    const session = cookie ? sessions.get(cookie) : undefined;
    if (session) session.touched = now();
    return session;
  };
  const json = (res: ServerResponse, status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
  const server = createServer((req, res) => { void handle(req, res).catch(() => { if (!res.headersSent) json(res, 500, { error: 'Chat service unavailable. Your game can continue.' }); else res.end(); }); });
  const io = new Server(server, {
    maxHttpBufferSize: 4096, serveClient: false,
    allowRequest: (req, done) => done(null, req.headers.origin === config.origin),
    cors: { origin: config.origin, credentials: true },
  });
  const publish = (session: Session, status: ChatStatus) => {
    session.status = { ...status, ...(session.auth?.user ? { channel: session.auth.user.login } : {}) };
    if (session.host) io.to(session.host).emit('chat:status', { ...session.status, serverTime: now() });
  };
  const publishInbox = (session: Session) => { if (session.host) io.to(session.host).emit('chat:suggestions', session.inbox.snapshot()); };
  const stop = (session: Session) => {
    session.epoch++; session.wire?.stop(); session.wire = undefined;
    clearInterval(session.validateTimer); session.validateTimer = undefined;
    session.auth?.clear(); session.auth = undefined; session.state = undefined;
    session.inbox.clear(); publishInbox(session);
  };
  const routeChat = (session: Session, chat: NormalizedChat) => {
    session.touched = now();
    const game = session.game;
    if (!session.host || !game || !session.inbox.accept(chat, game)) return false;
    publishInbox(session);
    return true;
  };
  const startWire = (session: Session, auth?: TwitchAuth) => {
    const epoch = session.epoch;
    const broadcaster = auth?.user?.id ?? '1234';
    session.wire = new EventSub({
      url: config.eventSubUrl, broadcasterId: broadcaster, source: auth ? 'twitch' : 'mock', socket: dependencies.socket,
      subscribe: async id => {
        if (auth) await auth.subscribe(id);
        else {
          const result = await request(config.subscriptionsUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: broadcaster, user_id: broadcaster }, transport: { method: 'websocket', session_id: id } }), signal: AbortSignal.timeout(8000) });
          if (!result.ok) throw new Error('CLI subscription failed');
        }
      },
      status: status => {
        if (session.epoch !== epoch) return;
        if (status.state === 'auth-required') { auth?.clear(); clearInterval(session.validateTimer); }
        publish(session, status);
      },
      chat: chat => { if (session.epoch === epoch) routeChat(session, chat); },
    });
    session.wire.start();
  };
  io.use((socket, next) => {
    const session = sessionFor(socket.request);
    if (!session || !same(socket.handshake.auth?.csrf, session.csrf)) return next(new Error('Unauthorized game session'));
    socket.data.session = session;
    next();
  });
  io.on('connection', socket => {
    const session = socket.data.session as Session;
    const previous = session.host; session.host = socket.id;
    if (previous) io.sockets.sockets.get(previous)?.disconnect(true);
    session.game = undefined;
    socket.emit('chat:status', { ...session.status, serverTime: now() });
    socket.emit('chat:suggestions', session.inbox.snapshot());
    socket.on('game:state', input => {
      if (session.host !== socket.id) return;
      const result = GameContextSchema.safeParse(input);
      if (!result.success) return;
      const prior = session.game; const state = result.data;
      if (prior?.instanceId === state.instanceId && (state.runId < prior.runId || (state.runId === prior.runId && state.wave < prior.wave))) return;
      session.game = state; session.touched = now(); session.inbox.setContext(state); publishInbox(session);
    });
    socket.on('disconnect', () => { if (session.host === socket.id) { session.host = undefined; session.game = undefined; } });
  });
  const clean = setInterval(() => {
    for (const [key, session] of sessions) if (now() - session.touched > 12 * 60 * 60_000) {
      stop(session); if (session.host) io.sockets.sockets.get(session.host)?.disconnect(true); sessions.delete(key);
    }
  }, 60_000); clean.unref();
  const body = async (req: IncomingMessage) => {
    let text = '';
    for await (const chunk of req) { text += String(chunk); if (text.length > 4096) throw new Error('Body too large'); }
    return text ? JSON.parse(text) as unknown : {};
  };
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', config.origin);
    if (req.headers.origin && req.headers.origin !== config.origin) { json(res, 403, { error: 'Wrong origin' }); return; }
    if (req.method === 'GET' && url.pathname === '/api/health') { json(res, 200, { ok: true }); return; }
    if (req.method === 'GET' && url.pathname === '/api/session') {
      let session = sessionFor(req);
      if (!session) {
        if (sessions.size >= 100) { json(res, 503, { error: 'Chat service is busy. Try later.' }); return; }
        const key = random();
        session = { id: randomUUID(), csrf: random(), touched: now(), epoch: 0, inbox: new SuggestionInbox(now), status: { state: 'offline' } };
        sessions.set(key, session);
        res.setHeader('Set-Cookie', `${COOKIE}=${key}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${config.origin.startsWith('https:') ? '; Secure' : ''}`);
      }
      json(res, 200, { sessionId: session.id, csrf: session.csrf, origin: config.origin, configured: Boolean(config.clientId && config.clientSecret), mockEnabled: config.mockChat, status: session.status }); return;
    }
    const session = sessionFor(req);
    if (req.method === 'GET' && url.pathname === '/api/twitch/callback') {
      if (!session || !session.state || !same(url.searchParams.get('state'), session.state) || now() > (session.stateUntil ?? 0)) { json(res, 400, { error: 'This connection request expired. Try Connect Twitch again.' }); return; }
      session.state = undefined;
      const epoch = session.epoch;
      const code = url.searchParams.get('code');
      if (!code || code.length > 2048 || url.searchParams.has('error')) { publish(session, { state: 'offline', detail: 'Twitch connection canceled.' }); json(res, 400, { error: 'Twitch connection canceled.' }); return; }
      const auth = new TwitchAuth(config, request);
      try {
        await auth.exchange(code);
        if (session.epoch !== epoch) { auth.clear(); json(res, 409, { error: 'Connection request replaced.' }); return; }
        session.auth = auth; startWire(session, auth);
        session.validateTimer = setInterval(() => { void auth.validate().catch(error => {
          if (session.epoch !== epoch) return;
          stop(session); publish(session, { state: error instanceof AuthError ? 'auth-required' : 'offline', detail: 'Chat access could not be verified. Connect Twitch again.' });
        }); }, 60 * 60_000); session.validateTimer.unref();
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'" });
        res.end('<!doctype html><title>Twitch connected</title><p>Twitch connected. You can return to your game.</p><script>window.close()</script>');
      } catch { auth.clear(); if (session.epoch === epoch) publish(session, { state: 'auth-required', detail: 'Could not connect Twitch. Try again.' }); json(res, 401, { error: 'Could not connect Twitch. Try again.' }); }
      return;
    }
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      if (!session || req.headers.origin !== config.origin || !same(req.headers['x-csrf-token'], session.csrf)) { json(res, 403, { error: 'Unauthorized game control' }); return; }
      if (url.pathname === '/api/twitch/connect') {
        if (!config.clientId || !config.clientSecret) { json(res, 503, { error: 'Twitch setup is missing on the server.' }); return; }
        if (session.stateUntil && now() < session.stateUntil - 598_000) { json(res, 429, { error: 'Wait a moment before connecting again.' }); return; }
        stop(session); session.state = random(); session.stateUntil = now() + 600_000;
        const authorization = new URL('https://id.twitch.tv/oauth2/authorize');
        authorization.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: `${config.origin}/api/twitch/callback`, response_type: 'code', scope: CHAT_SCOPE, state: session.state, force_verify: 'true' }).toString();
        publish(session, { state: 'connecting', detail: 'Finish connecting in the Twitch window.' }); json(res, 200, { url: authorization.href }); return;
      }
      if (url.pathname === '/api/twitch/disconnect') { stop(session); publish(session, { state: 'offline', detail: 'Chat disconnected.' }); json(res, 200, { ok: true }); return; }
      if (url.pathname === '/api/mock/connect' && config.mockChat) {
        stop(session); publish(session, { state: 'mock', detail: config.cli ? 'Local Twitch CLI test — not live chat' : 'Local test chat — not Twitch' });
        if (config.cli) startWire(session);
        json(res, 200, { ok: true }); return;
      }
      if (url.pathname === '/api/mock/message' && config.mockChat && session.status.state === 'mock') {
        let input: unknown; try { input = await body(req); } catch { json(res, 400, { error: 'Invalid test message' }); return; }
        const parsed = MockSchema.safeParse(input);
        if (!parsed.success) { json(res, 400, { error: 'Use a viewer name and a short chat message.' }); return; }
        const accepted = routeChat(session, { id: randomUUID(), viewerId: parsed.data.viewer.toLowerCase(), viewer: parsed.data.viewer, text: parsed.data.text, source: 'mock' });
        json(res, 200, { accepted }); return;
      }
      json(res, 404, { error: 'Unknown control' }); return;
    }
    if (req.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.split('/').some(part => part.startsWith('.'))) { json(res, 404, { error: 'Not found' }); return; }
    const root = resolve('dist');
    const extensions: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
    try {
      const path = await realpath(resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`));
      if (!path.startsWith(root + sep) || !extensions[extname(path)]) throw new Error('Not public');
      res.writeHead(200, { 'Content-Type': extensions[extname(path)], 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); res.end(await readFile(path));
    } catch { json(res, 404, { error: 'Not found' }); }
  }
  return {
    server, io,
    close: () => new Promise<void>(resolve => { clearInterval(clean); for (const session of sessions.values()) stop(session); io.close(() => resolve()); }),
  };
}
