export interface ServerConfig {
  origin: string; host: string; port: number; clientId: string; clientSecret: string;
  mockChat: boolean; cli: boolean; eventSubUrl: string; subscriptionsUrl: string;
  openaiApiKey: string; openaiModel: string;
}
export function configFromEnvironment(env: NodeJS.ProcessEnv): ServerConfig {
  const origin = new URL(env.PUBLIC_ORIGIN ?? 'http://localhost:5173');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.pathname !== '/' || origin.username || origin.password || origin.search || origin.hash) throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin.');
  if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Public deployments require HTTPS.');
  const cli = env.TWITCH_CLI_TEST === 'true';
  const mockChat = env.MOCK_CHAT === 'true';
  if (cli && (!mockChat || !['localhost', '127.0.0.1'].includes(origin.hostname))) throw new Error('CLI fixtures require local mock mode.');
  return {
    origin: origin.origin, host: env.HOST ?? '127.0.0.1', port: Number(env.PORT ?? 3001),
    clientId: env.TWITCH_CLIENT_ID ?? '', clientSecret: env.TWITCH_CLIENT_SECRET ?? '', mockChat, cli,
    openaiApiKey: env.OPENAI_API_KEY ?? '', openaiModel: env.OPENAI_MODEL ?? 'gpt-4.1-mini',
    eventSubUrl: cli ? 'ws://127.0.0.1:8080/ws' : 'wss://eventsub.wss.twitch.tv/ws',
    subscriptionsUrl: cli ? 'http://127.0.0.1:8080/eventsub/subscriptions' : 'https://api.twitch.tv/helix/eventsub/subscriptions',
  };
}
