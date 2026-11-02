import { io, type Socket } from 'socket.io-client';
import { InboxSchema, type InboxSnapshot, type ChatStatus, type GameContext } from '../shared/chat';
import type { SabotageManager } from '../game/rules/SabotageManager';

interface Context { manager: SabotageManager; phase: GameContext['phase']; paused: boolean; typing(focused: boolean): void }
interface Session { sessionId: string; csrf: string; origin: string; configured: boolean; mockEnabled: boolean; status: ChatStatus }
export class GameChat {
  private root = document.createElement('details');
  private status = document.createElement('p');
  private activity = document.createElement('p');
  private connect = document.createElement('button');
  private local = document.createElement('button');
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

  constructor(private current: () => Context | undefined, private subscribe: (fn: () => void) => () => void) {
    this.root.id = 'chat-panel'; this.root.className = 'chat-panel';
    const summary = document.createElement('summary'); summary.textContent = 'Twitch chat';
    this.status.id = 'chat-status'; this.status.setAttribute('role', 'status');
    this.activity.id = 'chat-activity'; this.activity.setAttribute('role', 'status');
    const controls = document.createElement('div'); controls.className = 'debug-actions';
    this.connect.textContent = 'Connect Twitch'; this.connect.type = 'button';
    this.local.textContent = 'Use local test chat'; this.local.type = 'button'; this.local.hidden = true;
    const disconnect = document.createElement('button'); disconnect.textContent = 'Disconnect chat'; disconnect.type = 'button';
    controls.append(this.connect, this.local, disconnect);
    const note = document.createElement('p'); note.textContent = 'Suggest changes in normal chat during a wave. Suggestions are collected for the next wave. Processing is not connected yet, so collected suggestions do not change gameplay.';
    this.mockForm.hidden = true;
    const label = document.createElement('strong'); label.textContent = 'Local test chat — not Twitch';
    this.viewer.value = 'TestViewer'; this.viewer.maxLength = 25; this.viewer.setAttribute('aria-label', 'Test viewer');
    this.message.placeholder = 'Make defeated robots explode'; this.message.maxLength = 500; this.message.setAttribute('aria-label', 'Test chat message');
    const send = document.createElement('button'); send.type = 'submit'; send.textContent = 'Send test message';
    this.mockForm.append(label, this.viewer, this.message, send);
    this.suggestions.id = 'chat-suggestions';
    this.root.append(summary, this.status, controls, note, this.mockForm, this.activity, this.suggestions);
    document.querySelector('.arena')!.append(this.root);
    this.connect.addEventListener('click', () => { void this.authorize(); }, { signal: this.controller.signal });
    this.local.addEventListener('click', () => { void this.post('/api/mock/connect').catch(() => this.show('Could not start local test chat.')); }, { signal: this.controller.signal });
    disconnect.addEventListener('click', () => { void this.post('/api/twitch/disconnect').catch(() => this.show('Chat server unavailable.')); }, { signal: this.controller.signal });
    this.mockForm.addEventListener('submit', event => {
      event.preventDefault();
      void this.post('/api/mock/message', { viewer: this.viewer.value, text: this.message.value }).then(result => {
        this.activity.textContent = result.accepted ? 'Suggestion collected for the next wave.' : 'Suggestion not collected. Send an idea during a wave, or wait a moment and try again.';
      }).catch(() => { this.activity.textContent = 'Could not send the test message.'; });
    }, { signal: this.controller.signal });
    for (const input of [this.message, this.viewer]) input.addEventListener('keydown', event => event.stopPropagation(), { signal: this.controller.signal });
    for (const input of [this.message, this.viewer]) {
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
        socket.on('chat:suggestions', input => {
          const result = InboxSchema.safeParse(input);
          if (!result.success) return;
          this.inbox = result.data; this.renderInbox();
        });
        socket.on('disconnect', () => { this.root.dataset.connected = 'false'; this.show('Chat connection lost. Your game can continue.'); });
        socket.on('connect_error', error => { this.root.dataset.connected = 'false'; this.show('Chat unavailable. Your game can continue.'); if (error.message === 'Unauthorized game session') { clearTimeout(this.retry); this.retry = setTimeout(() => { if (!this.destroyed) void this.bootstrap(); }, 2000); } });
      } catch { if (!this.destroyed) this.show('Chat server unavailable. You can play without it.'); }
    })().finally(() => { this.booting = undefined; });
    return this.booting;
  }
  private sync(force = false): void {
    const context = this.current(); if (!context || !this.socket?.connected) return;
    const state: GameContext = { instanceId: this.instanceId, runId: context.manager.runId, wave: context.manager.wave, phase: context.phase, paused: context.paused };
    const signature = JSON.stringify(state);
    if (force || signature !== this.prior) { this.socket.emit('game:state', state); this.prior = signature; this.renderInbox(); }
  }
  private renderInbox(): void {
    const context = this.current();
    this.suggestions.replaceChildren();
    if (!context || this.inbox?.instanceId !== this.instanceId || this.inbox.runId !== context.manager.runId) return;
    for (const batch of this.inbox.batches) {
      const section = document.createElement('section'); section.dataset.wave = String(batch.targetWave);
      const heading = document.createElement('h3'); heading.textContent = `Suggestions for wave ${batch.targetWave}`;
      const status = document.createElement('p'); status.textContent = batch.state === 'collecting' ? 'Collecting ideas…' : 'Collection closed · waiting for processing';
      const list = document.createElement('ul');
      for (const suggestion of batch.suggestions) {
        const item = document.createElement('li'); item.textContent = `${suggestion.source === 'mock' ? 'Test chat · ' : ''}${suggestion.viewer}: ${suggestion.text}`; list.append(item);
      }
      section.append(heading, status, list); this.suggestions.append(section);
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
  destroy(): void { this.destroyed = true; this.current()?.typing(false); this.controller.abort(); this.socket?.removeAllListeners(); this.socket?.disconnect(); clearInterval(this.pulse); clearTimeout(this.retry); this.unsubscribe(); this.root.remove(); }
}
