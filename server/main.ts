import { existsSync } from 'node:fs';
import { createGateway } from './gateway.ts';
import { configFromEnvironment } from './config.ts';

// Only the user-launched server loads private settings. Tests import the factory with explicit fixtures.
if (existsSync('.env')) process.loadEnvFile('.env');
const config = configFromEnvironment(process.env);
const gateway = createGateway(config);
gateway.server.once('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE'
    ? `Port ${config.port} is already in use. Stop the existing chat server with Ctrl+C in its terminal, then run npm run server again.`
    : `Chat server could not start (${error.code ?? 'unknown error'}).`);
  void gateway.close().finally(() => process.exit(1));
});
gateway.server.listen(config.port, config.host, () => console.log(`Chat server ready at ${config.origin}.`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void gateway.close().then(() => process.exit(0)); });
