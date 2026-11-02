# Twitch connection and next-wave suggestions

Chat gives suggestions in ordinary messages during wave N. The server collects
them for wave N+1. There is no `!command` parser and no immediate chat-triggered
effect. M4 supplies the transport and inbox; M5 will interpret batches, validate
composed rules, announce approved changes and activate them at the wave boundary.
Until M5, the panel explicitly says processing is not connected. Raw suggestions
never enter the rule engine. Standalone gameplay and manual debug rules still work.

## Private setup

Use Node 22.18+ or Node 24. Install dependencies with `npm install`.

1. Register a Twitch developer application. Add this exact OAuth redirect URL:
   `http://localhost:5173/api/twitch/callback`.
2. Copy the names in `server-settings.example` into your private `.env` yourself.
   Set `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` there. Never use `VITE_*`
   variables for secrets and never paste secrets into chat or source files.
3. In one terminal, start `npm run server` yourself. This user-launched entry
   point loads `.env`; automated checks do not launch it.
4. In another terminal, run `npm run dev`, open `http://localhost:5173`, expand
   **Twitch chat**, and click **Connect Twitch**. Allow the popup and authorize
   the streamer account whose own channel will provide suggestions.
5. Start a wave and send a normal idea in that channel. It should appear as a
   suggestion for the following wave, attributed to its viewer. Collection closes
   when combat ends. Restarting or dying clears the batch.

Twitch's HTTP redirect exception uses the literal hostname `localhost`; an HTTP
redirect to `127.0.0.1` is rejected. Set `PUBLIC_ORIGIN=http://localhost:5173` in
your private `.env` and use that same origin in the browser. Restart the chat
server after changing settings. The internal server/proxy can still use
`127.0.0.1`. See [Twitch's local OAuth examples](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#examples-of-the-four-flows).

If Vite reports a WebSocket proxy error while connecting, check that the browser
uses the exact `PUBLIC_ORIGIN`, including its hostname and port. Restart the chat
server after editing `.env`, then reload the game at `http://localhost:5173`.
The chat panel identifies a mismatched address before trying a WebSocket.

The app requests only `user:read:chat`, using Twitch's authorization-code flow
with a server-side secret. The broadcaster and reading user are the authenticated
streamer. It does not send chat, moderate viewers, or join other channels. See
[Twitch chat authentication](https://dev.twitch.tv/docs/chat/authenticating/) and
[authorization-code flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow).

Tokens remain in server memory, are validated initially and hourly, and refresh
on authorization expiry. Restarting the server requires reconnecting Twitch.
**Disconnect chat** stops EventSub, clears tokens and drops collected suggestions.
Token revocation or failed refresh asks the streamer to connect again. EventSub
silence triggers reconnect; a Twitch reconnect message transfers the connection
without creating duplicate subscriptions. See [token validation](https://dev.twitch.tv/docs/authentication/validate-tokens/),
[refresh](https://dev.twitch.tv/docs/authentication/refresh-tokens/) and
[EventSub WebSockets](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/).

For a built app, run `npm run build` and use the Node server to serve `dist/`.
Set `PUBLIC_ORIGIN` and the registered callback to the actual address, such as
`http://localhost:3001` for a local built-app check. Public deployments require
HTTPS with `/api` and `/socket.io` routed to the same Node service. The current
session/token store is in memory for one server process, not a multi-node service.

## Intake limits and ownership

- Collect only during combat, including paused combat. No intake in menus,
  settlement, shops or after death. The current wave never changes from raw chat.
- At most 500 characters per idea, 20 ideas per batch and two batches per game.
  Leading `!` messages and empty messages are ignored.
- Each viewer can contribute once every 10 seconds. A session-wide burst allows
  three suggestions, then refills one slot every two seconds. The oldest wave's
  batch drops when the game advances past it.
- Event IDs are deduplicated in a bounded ten-minute cache. Messages from other
  broadcasters, including shared-chat sources outside the streamer's channel,
  are discarded. Viewer text is displayed as text, never HTML.
- An HttpOnly cookie and CSRF token bind the browser to its session. HTTP controls
  and WebSocket upgrades require the configured origin. Only that session's
  active game socket receives its inbox; a replacement tab disconnects the old
  host. Reconnect restores the inbox after resynchronizing run/wave identity.
- Messages arriving while the host is disconnected are dropped. A new run or
  page instance clears old suggestions. Missing Twitch/backend connections never
  block local combat.

## Safe local checks

`npm run check` uses explicit synthetic settings through
`scripts/test-gateway.mjs`, never the private server entry point. Vite and Vitest
disable automatic env-file loading. Tests do not require credentials or Twitch.
Gateway tests cover ownership, unauthorized requests, OAuth state, reconnects and
next-wave collection. Browser tests cover the real panel, safe text rendering,
keyboard input, cross-session isolation, cleanup and missing-backend play.

For a user-run local demo, set `MOCK_CHAT=true`, start your server and choose
**Use local test chat**. The panel is marked **Local test chat — not Twitch**.
Its messages use the same bounded suggestion inbox, with a fixed mock source;
clients cannot label themselves as Twitch. Disable mock mode for public use.

The official [Twitch CLI mock WebSocket server](https://dev.twitch.tv/docs/cli/websocket-event-command/)
can also exercise the transport: run `twitch event websocket start-server
--require-subscription`, enable both `MOCK_CHAT=true` and `TWITCH_CLI_TEST=true`
in your private settings, restart your server yourself, then choose local chat.
The mock broadcaster is `1234`; send `channel.chat.message` events for that ID.
`twitch event websocket reconnect` tests handoff. CLI events are always labeled
as local tests. CLI mode is rejected for non-local origins.

Live account authorization and receipt of a real channel message must be checked
by the streamer after private setup; fixture success does not prove live access.
