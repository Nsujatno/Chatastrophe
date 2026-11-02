import { z } from 'zod';
export const CHAT_LIMITS = { userCooldownMs: 10_000, burst: 3, refillMs: 2000, seenMessages: 2000, seenMs: 600_000, text: 500, suggestionsPerWave: 20, batches: 2 } as const;

export const GameContextSchema = z.object({
  instanceId: z.uuid(), runId: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  wave: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  phase: z.enum(['ready', 'playing', 'settling', 'shop', 'lost']), paused: z.boolean(),
}).strict();
export type GameContext = z.infer<typeof GameContextSchema>;
export const SuggestionSchema = z.object({
  id: z.string().min(1).max(160), text: z.string().min(1).max(CHAT_LIMITS.text),
  source: z.enum(['twitch', 'mock']), viewer: z.string().min(1).max(50), receivedAt: z.number().finite(),
}).strict();
export const SuggestionBatchSchema = z.object({
  targetWave: z.number().int().min(1), state: z.enum(['collecting', 'ready']),
  suggestions: z.array(SuggestionSchema).max(CHAT_LIMITS.suggestionsPerWave),
}).strict();
export const InboxSchema = z.object({ instanceId: z.uuid().optional(), runId: z.number().int().min(1).optional(), batches: z.array(SuggestionBatchSchema).max(CHAT_LIMITS.batches) }).strict();
export type Suggestion = z.infer<typeof SuggestionSchema>;
export type SuggestionBatch = z.infer<typeof SuggestionBatchSchema>;
export type InboxSnapshot = z.infer<typeof InboxSchema>;
export type ChatStatus = { state: 'offline' | 'connecting' | 'connected' | 'reconnecting' | 'auth-required' | 'mock'; channel?: string; detail?: string };
export type NormalizedChat = { id: string; viewerId: string; viewer: string; text: string; source: 'twitch' | 'mock' };
