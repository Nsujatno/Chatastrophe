import { z } from 'zod';
import { RulesetSchema } from './rules.ts';

export const DIRECTOR_LIMITS = { messages: 200, voteMs: 30_000, generationMs: 30_000 } as const;
export const DirectorOptionsSchema = z.object({ options: z.array(RulesetSchema).max(3) }).strict();
export const DirectorStateSchema = z.object({
  instanceId: z.uuid(), runId: z.number().int().positive(), targetWave: z.number().int().positive(),
  state: z.enum(['collecting', 'generating', 'voting', 'complete', 'skipped', 'error']),
  options: z.array(RulesetSchema).max(3), votes: z.array(z.number().int().nonnegative()).max(3),
  deadline: z.number().nullable(), winner: z.number().int().min(0).max(2).nullable(),
  messageCount: z.number().int().min(0).max(DIRECTOR_LIMITS.messages),
  source: z.enum(['twitch', 'mock']), detail: z.string().max(300),
}).strict();
export type DirectorState = z.infer<typeof DirectorStateSchema>;
