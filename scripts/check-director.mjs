import { existsSync } from 'node:fs';
import { openAIGenerator } from '../server/director.ts';
import { configFromEnvironment } from '../server/config.ts';
import { describeRuleset } from '../src/shared/rules.ts';

if (existsSync('.env')) process.loadEnvFile('.env');
const config = configFromEnvironment(process.env);
const ideas = ['Make defeated drones split into two tiny weaker drones!', 'Make the little drones explode when defeated', 'Give the streamer faster shots but make the robots rush them'];
try {
  const options = await openAIGenerator(config.openaiApiKey, config.openaiModel)({
    game: { instanceId: crypto.randomUUID(), runId: 1, wave: 1, phase: 'shop', paused: false },
    messages: ideas.map((text, index) => ({ id: `check:${index}`, text, viewer: `Fixture${index}`, source: 'mock', receivedAt: Date.now() })),
    signal: new AbortController().signal,
  });
  console.log(`OpenAI returned ${options.length} validated options with ${config.openaiModel}.`);
  for (const option of options) console.log(`${option.name}: ${describeRuleset(option).join(' ')}`);
  if (!options.length) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Director check failed.'); process.exitCode = 1;
}
