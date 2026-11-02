import { createGateway } from '../server/gateway.ts';
import { configFromEnvironment } from '../server/config.ts';

// Explicit isolated fixtures only: this process never loads private configuration files.
const config = configFromEnvironment({ PORT: '3002', PUBLIC_ORIGIN: 'http://127.0.0.1:4173', MOCK_CHAT: 'true' });
const gateway = createGateway(config);
gateway.server.listen(config.port, config.host, () => console.log('Isolated chat test gateway ready.'));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void gateway.close().then(() => process.exit(0)); });
