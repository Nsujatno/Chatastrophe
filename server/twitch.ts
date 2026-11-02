import { z } from 'zod';
import type { NormalizedChat, ChatStatus } from '../src/shared/chat.ts';
import type { ServerConfig } from './config.ts';

export const CHAT_SCOPE = 'user:read:chat';
const TokenSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1) });
const UserSchema = z.object({ client_id: z.string(), user_id: z.string().min(1), login: z.string().min(1), scopes: z.array(z.string()) });
type Tokens = z.infer<typeof TokenSchema>;
export class AuthError extends Error {}
export class TwitchAuth {
  private refresh?: Promise<void>;
  private tokens?: Tokens;
  user?: { id: string; login: string };
  private config: ServerConfig;
  private request: typeof fetch;
  constructor(config: ServerConfig, request: typeof fetch = fetch) { this.config = config; this.request = request; }
  async exchange(code: string): Promise<void> {
    const data = await this.token({ code, grant_type: 'authorization_code', redirect_uri: `${this.config.origin}/api/twitch/callback` });
    this.tokens = data; await this.validate();
  }
  private async token(fields: Record<string, string>): Promise<Tokens> {
    const result = await this.request('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({ ...fields, client_id: this.config.clientId, client_secret: this.config.clientSecret }), signal: AbortSignal.timeout(8000) });
    if (!result.ok) throw new AuthError('Twitch authorization needs to be renewed.');
    return TokenSchema.parse(await result.json());
  }
  private async refreshTokens(): Promise<void> {
    if (!this.tokens) throw new AuthError('Connect Twitch again.');
    if (!this.refresh) this.refresh = this.token({ grant_type: 'refresh_token', refresh_token: this.tokens.refresh_token }).then(tokens => { this.tokens = tokens; }).finally(() => { this.refresh = undefined; });
    return this.refresh;
  }
  async validate(): Promise<void> {
    if (!this.tokens) throw new AuthError('Connect Twitch again.');
    let result = await this.request('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${this.tokens.access_token}` }, signal: AbortSignal.timeout(8000) });
    if (result.status === 401) {
      await this.refreshTokens();
      result = await this.request('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${this.tokens!.access_token}` }, signal: AbortSignal.timeout(8000) });
    }
    if (result.status === 401) throw new AuthError('Connect Twitch again.');
    if (!result.ok) throw new Error('Twitch is temporarily unavailable.');
    const user = UserSchema.parse(await result.json());
    if (user.client_id !== this.config.clientId || !user.scopes.includes(CHAT_SCOPE)) throw new AuthError('Twitch did not grant chat access.');
    this.user = { id: user.user_id, login: user.login };
  }
  async subscribe(sessionId: string): Promise<void> {
    if (!this.user || !this.tokens) throw new AuthError('Connect Twitch again.');
    const send = () => this.request(this.config.subscriptionsUrl, { method: 'POST', headers: { Authorization: `Bearer ${this.tokens!.access_token}`, 'Client-Id': this.config.clientId, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: this.user!.id, user_id: this.user!.id }, transport: { method: 'websocket', session_id: sessionId } }), signal: AbortSignal.timeout(8000) });
    let result = await send();
    if (result.status === 401) { await this.refreshTokens(); result = await send(); }
    if (result.status === 401 || result.status === 403) throw new AuthError('Connect Twitch again to allow chat access.');
    if (!result.ok) throw new Error('Could not subscribe to Twitch chat.');
  }
  clear(): void { this.tokens = undefined; this.user = undefined; }
}

const EnvelopeSchema = z.object({ metadata: z.object({ message_type: z.string(), message_id: z.string().max(128) }), payload: z.record(z.string(), z.unknown()) });
const ChatSchema = z.object({ broadcaster_user_id: z.string(), chatter_user_id: z.string().min(1).max(128), chatter_user_name: z.string().min(1).max(50), message_id: z.string().min(1).max(128), message: z.object({ text: z.string().max(500) }), source_broadcaster_user_id: z.string().nullable().optional() });
export function normalizeChat(input: unknown, broadcasterId: string, source: 'twitch' | 'mock'): NormalizedChat | undefined {
  const parsed = ChatSchema.safeParse(input);
  if (!parsed.success || parsed.data.broadcaster_user_id !== broadcasterId || (parsed.data.source_broadcaster_user_id && parsed.data.source_broadcaster_user_id !== broadcasterId)) return;
  const chat = parsed.data;
  return { id: chat.message_id, viewerId: chat.chatter_user_id, viewer: chat.chatter_user_name, text: chat.message.text, source };
}
export interface EventSubOptions {
  url: string; broadcasterId: string; source: 'twitch' | 'mock';
  subscribe(id: string): Promise<void>; status(status: ChatStatus): void; chat(chat: NormalizedChat): void;
  socket?: (url: string) => WebSocket;
}
export class EventSub {
  private sockets = new Set<WebSocket>();
  private current?: WebSocket;
  private stopped = false;
  private retry?: ReturnType<typeof setTimeout>;
  private watchdog?: ReturnType<typeof setTimeout>;
  private attempts = 0;
  private controls = new Set<string>();
  private options: EventSubOptions;
  constructor(options: EventSubOptions) { this.options = options; }
  start(): void { this.open(this.options.url, false); }
  stop(): void { this.stopped = true; clearTimeout(this.retry); clearTimeout(this.watchdog); for (const socket of this.sockets) socket.close(); this.sockets.clear(); this.current = undefined; }
  private validReconnect(url: string): boolean {
    try { const parsed = new URL(url); const initial = new URL(this.options.url); return parsed.protocol === initial.protocol && parsed.host === initial.host && !parsed.username && !parsed.password; } catch { return false; }
  }
  private reconnect(): void {
    if (this.stopped || this.retry) return;
    this.options.status({ state: 'reconnecting', detail: 'Reconnecting to chat…' });
    this.retry = setTimeout(() => { this.retry = undefined; this.open(this.options.url, false); }, Math.min(30_000, 500 * 2 ** Math.min(this.attempts++, 6)));
    this.retry.unref?.();
  }
  private open(url: string, transfer: boolean): void {
    if (this.stopped) return;
    const socket = (this.options.socket ?? (url => new WebSocket(url)))(url);
    this.sockets.add(socket);
    const welcomeDeadline = setTimeout(() => { socket.close(); this.reconnect(); }, 10_000); welcomeDeadline.unref?.();
    let keepalive = 10;
    const alive = () => {
      if (this.current !== socket) return;
      clearTimeout(this.watchdog);
      this.watchdog = setTimeout(() => { socket.close(); this.reconnect(); }, (keepalive + 2) * 1000); this.watchdog.unref?.();
    };
    socket.addEventListener('message', event => { void (async () => {
      if (this.stopped || typeof event.data !== 'string' || event.data.length > 64_000) return;
      let input: unknown; try { input = JSON.parse(event.data); } catch { return; }
      const parsed = EnvelopeSchema.safeParse(input); if (!parsed.success) return;
      const { metadata, payload } = parsed.data;
      if (['session_welcome', 'session_reconnect', 'revocation'].includes(metadata.message_type)) {
        if (this.controls.has(metadata.message_id)) return;
        this.controls.add(metadata.message_id); if (this.controls.size > 128) this.controls.delete(this.controls.values().next().value!);
      }
      if (metadata.message_type === 'session_welcome') {
        clearTimeout(welcomeDeadline);
        const session = z.object({ id: z.string(), keepalive_timeout_seconds: z.number().min(1).max(600) }).parse(payload.session);
        if (!transfer) await this.options.subscribe(session.id);
        if (this.stopped) { socket.close(); return; }
        const previous = this.current; this.current = socket; keepalive = session.keepalive_timeout_seconds; this.attempts = 0; alive();
        if (previous && previous !== socket) previous.close();
        this.options.status({ state: this.options.source === 'mock' ? 'mock' : 'connected' });
      } else if (metadata.message_type === 'session_keepalive') alive();
      else if (metadata.message_type === 'session_reconnect' && socket === this.current) {
        const session = z.object({ reconnect_url: z.string() }).parse(payload.session);
        if (!this.validReconnect(session.reconnect_url)) throw new Error('Invalid reconnect destination');
        this.open(session.reconnect_url, true);
      } else if (metadata.message_type === 'revocation' && socket === this.current) {
        this.options.status({ state: 'auth-required', detail: 'Chat access ended. Connect Twitch again.' }); this.stop();
      } else if (metadata.message_type === 'notification' && socket === this.current) {
        alive();
        const subscription = z.object({ type: z.literal('channel.chat.message'), version: z.literal('1') }).safeParse(payload.subscription);
        if (!subscription.success) return;
        const chat = normalizeChat(payload.event, this.options.broadcasterId, this.options.source);
        if (chat) this.options.chat(chat);
      }
    })().catch(error => {
      if (this.stopped) return;
      if (error instanceof AuthError) { this.options.status({ state: 'auth-required', detail: error.message }); this.stop(); }
      else { socket.close(); this.reconnect(); }
    }); });
    socket.addEventListener('error', () => { socket.close(); });
    socket.addEventListener('close', () => { clearTimeout(welcomeDeadline); this.sockets.delete(socket); if (!this.stopped && (!this.current || this.current === socket)) this.reconnect(); });
  }
}
