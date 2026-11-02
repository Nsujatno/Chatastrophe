import { io, type Socket } from 'socket.io-client';
import { CHAT_LIMITS, ChatHistorySchema, ChatMessageSchema, InboxSchema, type ChatMessage, type InboxSnapshot, type ChatStatus, type GameContext } from '../shared/chat';
import type { SabotageManager } from '../game/rules/SabotageManager';
import { DirectorStateSchema } from '../shared/director';
import { DirectorUI } from './DirectorUI';

interface Context { manager: SabotageManager; phase: GameContext['phase']; paused: boolean; typing(focused: boolean): void; hold(held: boolean): void }
interface Session { sessionId: string; csrf: string; origin: string; configured: boolean; mockEnabled: boolean; status: ChatStatus }
export class GameChat {
  private root = document.createElement('aside');
  private status = document.createElement('p');
  private badge = document.createElement('span');
  private activity = document.createElement('p');
  private connect = document.createElement('button');
  private disconnect = document.createElement('button');
  private local = document.createElement('button');
  private feed = document.createElement('div');
  private messages = document.createElement('ol');
  private empty = document.createElement('p');
  private mockForm = document.createElement('form');
  private viewer = document.createElement('input');
  private message = document.createElement('input');
  private suggestions = document.createElement('div');
  private inbox?: InboxSnapshot;
  private socket?: Socket;
  private session?: Session;
  private originError?: string;
  private controller = new AbortController();
  private instanceId = crypto.randomUUID();
  private prior = '';
  private pulse: ReturnType<typeof setInterval>;
  private retry?: ReturnType<typeof setTimeout>;
  private booting?: Promise<void>;
  private destroyed = false;
  private director: DirectorUI;

  constructor(private current: () => Context | undefined, private subscribe: (fn: () => void) => () => void) {
    this.director = new DirectorUI(current, () => this.socket?.emit('director:skip'));
    this.root.id = 'chat-panel'; this.root.className = 'chat-panel';
    this.root.setAttribute('aria-labelledby', 'chat-title');
    const header = document.createElement('header'); header.className = 'chat-header';
    const title = document.createElement('h2'); title.id = 'chat-title'; title.textContent = 'Twitch chat';
    this.badge.className = 'chat-badge'; this.badge.textContent = 'Offline';
    header.append(title, this.badge);
    this.status.id = 'chat-status'; this.status.setAttribute('role', 'status');
    this.activity.id = 'chat-activity'; this.activity.setAttribute('role', 'status');
    const connection = document.createElement('div'); connection.className = 'chat-connection';
    const controls = document.createElement('div'); controls.className = 'chat-controls';
    this.connect.textContent = 'Connect Twitch'; this.connect.type = 'button'; this.connect.className = 'primary';
    this.local.textContent = 'Use local test chat'; this.local.type = 'button'; this.local.hidden = true; this.local.className = 'chat-local';
    this.disconnect.textContent = 'Disconnect chat'; this.disconnect.type = 'button'; this.disconnect.hidden = true;
    controls.append(this.connect, this.disconnect);
    connection.append(this.status, controls, this.local);
    this.feed.className = 'chat-timeline';
    this.messages.id = 'chat-messages'; this.messages.setAttribute('role', 'log'); this.messages.setAttribute('aria-label', 'Chat messages');
    this.messages.setAttribute('aria-live', 'polite'); this.messages.setAttribute('aria-relevant', 'additions');
    this.feed.tabIndex = 0; this.feed.setAttribute('role', 'region'); this.feed.setAttribute('aria-label', 'Chat history');
    this.empty.id = 'chat-empty'; this.empty.className = 'chat-empty';
    this.empty.textContent = 'Connect Twitch to see your channel’s messages here.';
    this.feed.append(this.empty, this.messages);
    const note = document.createElement('p'); note.className = 'chat-note'; note.textContent = 'Chat ideas shape the next wave. Between waves, vote 1, 2, or 3 during the 30-second vote. One vote per viewer. Ties favor the first option; no votes means no changes.';
    this.mockForm.hidden = true;
    this.mockForm.className = 'chat-mock-form';
    const label = document.createElement('strong'); label.textContent = 'Local test chat — not Twitch';
    this.viewer.value = 'TestViewer'; this.viewer.maxLength = 25; this.viewer.setAttribute('aria-label', 'Test viewer');
    this.message.placeholder = 'Make defeated robots explode'; this.message.maxLength = 500; this.message.setAttribute('aria-label', 'Test chat message');
    const send = document.createElement('button'); send.type = 'submit'; send.textContent = 'Send test message';
    this.mockForm.append(label, this.viewer, this.message, send);
    this.suggestions.id = 'chat-suggestions';
    this.root.append(header, connection, this.feed, this.suggestions, note, this.mockForm, this.activity);
    document.querySelector('.play-layout')!.append(this.root);
    this.connect.addEventListener('click', () => { void this.authorize(); }, { signal: this.controller.signal });
    this.local.addEventListener('click', () => { void this.post('/api/mock/connect').catch(() => this.show('Could not start local test chat.')); }, { signal: this.controller.signal });
    this.disconnect.addEventListener('click', () => { void this.post('/api/twitch/disconnect').catch(() => this.show('Chat server unavailable.')); }, { signal: this.controller.signal });
    this.mockForm.addEventListener('submit', event => {
      event.preventDefault();
      const voting = this.director.voting;
      void this.post('/api/mock/message', { viewer: this.viewer.value, text: this.message.value }).then(result => {
        this.message.value = '';
        this.activity.textContent = voting
          ? result.accepted ? 'Vote counted.' : 'Message sent. Vote 1, 2, or 3; each viewer gets one vote.'
          : result.accepted ? 'Suggestion collected for the next wave.' : 'Message sent. Ideas are collected during waves, with limits on repeated suggestions.';
      }).catch(() => { this.activity.textContent = 'Could not send the test message.'; });
    }, { signal: this.controller.signal });
    for (const input of [this.message, this.viewer, this.feed]) input.addEventListener('keydown', event => event.stopPropagation(), { signal: this.controller.signal });
    for (const input of [this.message, this.viewer, this.feed]) {
      input.addEventListener('focus', () => this.current()?.typing(true), { signal: this.controller.signal });
      input.addEventListener('blur', () => this.current()?.typing(false), { signal: this.controller.signal });
    }
    this.unsubscribe = this.subscribe(() => this.sync());
    this.pulse = setInterval(() => { if (this.socket?.connected) this.sync(true); }, 1000);
    this.show('Chat disconnected. You can play without it.');
    void this.bootstrap();
  }
  private unsubscribe: () => void;
  private show(text: string): void { this.status.textContent = text; }
  private update(status: ChatStatus): void {
    this.mockForm.hidden = status.state !== 'mock';
    this.local.hidden = !this.session?.mockEnabled || status.state === 'mock';
    this.connect.hidden = status.state === 'connected';
    this.connect.disabled = status.state === 'connecting';
    this.disconnect.hidden = !['connected', 'mock', 'connecting', 'reconnecting'].includes(status.state);
    this.badge.textContent = { offline: 'Offline', connecting: 'Connecting', connected: 'Live', reconnecting: 'Reconnecting', 'auth-required': 'Reconnect', mock: 'Test' }[status.state];
    this.root.dataset.state = status.state;
    this.empty.textContent = status.state === 'mock' ? 'Send a test message to try the chat feed.' : status.state === 'connected' ? `Waiting for messages from ${status.channel ? `#${status.channel}` : 'your channel'}…` : 'Connect Twitch to see your channel’s messages here.';
    this.show(status.detail ?? ({ offline: 'Chat disconnected. You can keep playing.', connecting: 'Connecting Twitch…', connected: `Twitch connected: ${status.channel ?? 'your channel'}`, reconnecting: 'Reconnecting to Twitch chat…', 'auth-required': 'Connect Twitch again to restore chat.', mock: 'Local test chat — not Twitch' }[status.state]));
    this.root.dataset.source = status.state === 'mock' ? 'mock' : status.state === 'connected' ? 'twitch' : 'offline';
  }
  private async bootstrap(): Promise<void> {
    if (this.booting) return this.booting;
    this.booting = (async () => {
      try {
        const response = await fetch('/api/session', { credentials: 'same-origin', signal: AbortSignal.timeout(4000), cache: 'no-store' });
        if (!response.ok) throw new Error('Unavailable');
        const session = await response.json() as Session;
        if (this.destroyed) return;
        if (session.origin && session.origin !== window.location.origin) {
          this.session = undefined;
          this.originError = `Open ${session.origin} to connect chat.`;
          this.show(this.originError);
          return;
        }
        this.originError = undefined;
        this.session = session; this.local.hidden = !session.mockEnabled; this.update(session.status);
        if (!session.configured && session.status.state === 'offline') this.show('Twitch settings are missing on the chat server. Local play still works.');
        this.socket?.removeAllListeners(); this.socket?.disconnect();
        const socket = io({ transports: ['websocket'], auth: { csrf: session.csrf }, withCredentials: true, reconnectionDelay: 500, reconnectionDelayMax: 5000 });
        this.socket = socket;
        socket.on('connect', () => { this.root.dataset.connected = 'true'; this.prior = ''; this.sync(true); });
        socket.on('chat:status', (status: ChatStatus) => this.update(status));
        socket.on('chat:history', input => {
          const result = ChatHistorySchema.safeParse(input);
          if (!result.success) return;
          this.messages.replaceChildren();
          for (const message of result.data) this.appendMessage(message);
          this.empty.hidden = result.data.length > 0;
          this.feed.scrollTop = this.feed.scrollHeight;
        });
        socket.on('chat:message', input => {
          const result = ChatMessageSchema.safeParse(input);
          if (result.success) this.appendMessage(result.data);
        });
        socket.on('director:state', input => {
          if (input === null) { this.director.receive(null); this.renderInbox(); return; }
          const result = DirectorStateSchema.safeParse(input);
          if (result.success && result.data.instanceId === this.instanceId) { this.director.receive(result.data); this.renderInbox(); }
        });
        socket.on('chat:suggestions', input => {
          const result = InboxSchema.safeParse(input);
          if (!result.success) return;
          this.inbox = result.data; this.renderInbox();
        });
        socket.on('disconnect', () => { this.director.receive(null); this.root.dataset.connected = 'false'; this.update({ state: 'offline', detail: 'Chat connection lost. Your game can continue.' }); });
        socket.on('connect_error', error => { this.root.dataset.connected = 'false'; this.update({ state: 'offline', detail: 'Chat unavailable. Your game can continue.' }); if (error.message === 'Unauthorized game session') { clearTimeout(this.retry); this.retry = setTimeout(() => { if (!this.destroyed) void this.bootstrap(); }, 2000); } });
      } catch { if (!this.destroyed) this.show('Chat server unavailable. You can play without it.'); }
    })().finally(() => { this.booting = undefined; });
    return this.booting;
  }
  private sync(force = false): void {
    this.director.sync();
    const context = this.current(); if (!context || !this.socket?.connected) return;
    const state: GameContext = { instanceId: this.instanceId, runId: context.manager.runId, wave: context.manager.wave, phase: context.phase, paused: context.paused };
    const signature = JSON.stringify(state);
    if (force || signature !== this.prior) { this.socket.emit('game:state', state); this.prior = signature; this.renderInbox(); }
  }
  private appendMessage(message: ChatMessage): void {
    if (Array.from(this.messages.children).some(item => (item as HTMLElement).dataset.id === message.id)) return;
    const follow = this.feed.scrollHeight - this.feed.scrollTop - this.feed.clientHeight < 48;
    const item = document.createElement('li'); item.dataset.id = message.id; item.dataset.source = message.source;
    const viewer = document.createElement('strong'); viewer.textContent = `${message.source === 'mock' ? 'Test · ' : ''}${message.viewer}`;
    const text = document.createElement('span'); text.textContent = `: ${message.text}`;
    item.append(viewer, text); this.messages.append(item); this.empty.hidden = true;
    while (this.messages.children.length > CHAT_LIMITS.history) this.messages.firstElementChild!.remove();
    if (follow) this.feed.scrollTop = this.feed.scrollHeight;
  }
  private renderInbox(): void {
    const context = this.current();
    this.suggestions.replaceChildren();
    if (!context || this.inbox?.instanceId !== this.instanceId || this.inbox.runId !== context.manager.runId) return;
    for (const batch of this.inbox.batches) {
      const section = document.createElement('section'); section.dataset.wave = String(batch.targetWave);
      const heading = document.createElement('h3'); heading.textContent = `Suggestions for wave ${batch.targetWave}`;
      const count = document.createElement('span'); count.className = 'suggestion-count'; count.textContent = `${batch.suggestions.length} ${batch.suggestions.length === 1 ? 'idea' : 'ideas'}`;
      heading.append(count);
      const status = document.createElement('p'); status.textContent = batch.state === 'collecting' ? 'Collecting ideas…' : `Collection closed · ${this.director.statusFor(batch.targetWave) ?? 'waiting for processing'}`;
      section.append(heading, status); this.suggestions.append(section);
    }
  }
  private async post(path: string, body = {}): Promise<Record<string, unknown>> {
    if (!this.session) await this.bootstrap();
    if (!this.session) throw new Error(this.originError ?? 'Chat unavailable');
    const response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.session.csrf }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    const result = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Chat unavailable');
    return result;
  }
  private async authorize(): Promise<void> {
    const popup = window.open('about:blank', 'chatastrophe-twitch', 'width=600,height=740');
    if (!popup) { this.show('Allow a popup to connect Twitch.'); return; }
    popup.opener = null;
    try {
      const result = await this.post('/api/twitch/connect');
      if (typeof result.url !== 'string' || new URL(result.url).origin !== 'https://id.twitch.tv') throw new Error('Could not open Twitch.');
      popup.location.replace(result.url);
    } catch (error) { popup.close(); this.show(error instanceof Error ? error.message : 'Could not connect Twitch.'); }
  }
  destroy(): void { this.destroyed = true; this.director.destroy(); this.current()?.typing(false); this.controller.abort(); this.socket?.removeAllListeners(); this.socket?.disconnect(); clearInterval(this.pulse); clearTimeout(this.retry); this.unsubscribe(); this.root.remove(); }
}
