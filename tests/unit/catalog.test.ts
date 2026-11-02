import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { ACTION_COSTS, RULE_LIMITS, getRuleCatalog, parseRuleset, validateRuleset } from '../../src/shared/rules';
import rescue from '../../docs/rules/rescue-party.json' with { type: 'json' };
import haulers from '../../docs/rules/volatile-haulers.json' with { type: 'json' };
import lastStand from '../../docs/rules/last-stand.json' with { type: 'json' };

describe('integration contract', () => {
  it('exports the generated JSON catalog from Node without Phaser or a browser', () => {
    const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "import { getRuleCatalog } from './src/shared/rules.ts'; process.stdout.write(JSON.stringify(getRuleCatalog()));"], { encoding: 'utf8' });
    expect(result.stderr, result.error?.message).not.toContain('ReferenceError');
    expect(result.status, result.stderr).toBe(0);
    const catalog = JSON.parse(result.stdout);
    expect(catalog).toEqual(getRuleCatalog());
    expect(catalog).toEqual(JSON.parse(readFileSync('docs/rule-catalog.json', 'utf8')));
    expect(Object.keys(catalog.triggers)).toHaveLength(5);
    expect(catalog.filters).toHaveLength(4);
    expect(catalog.selectors).toEqual(['player', 'event_entity', 'enemies']);
    expect(catalog.anchors).toEqual(['event', 'player', 'arena']);
    expect(catalog.actions).toEqual(ACTION_COSTS);
    expect(catalog.schema.additionalProperties).toBe(false);
    expect(catalog.runtimeChecks).toContain('total_action_cost');
  });

  it('returns independent catalog data that cannot loosen validation', () => {
    const catalog = getRuleCatalog();
    Object.assign(catalog.triggers.interval, { position: true });
    Object.assign(catalog.limits, { chaos: 999 });
    catalog.stats.player.length = 0;
    expect(getRuleCatalog().triggers.interval.position).toBe(false);
    expect(getRuleCatalog().limits.chaos).toBe(RULE_LIMITS.chaos);
    expect(getRuleCatalog().stats.player).toHaveLength(3);
    expect(validateRuleset({ ...haulers, rules: [{ ...haulers.rules[0], trigger: { type: 'interval', everyMs: 1000 } }] }).ok).toBe(false);
  });

  it.each([rescue, haulers, lastStand])('round-trips $name through the shared raw/structured paths', example => {
    const parsed = parseRuleset(JSON.stringify(example));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    expect(parseRuleset(JSON.stringify(parsed.data))).toEqual(parsed);
    expect(validateRuleset(parsed.data)).toEqual(parsed);
  });

  it('rejects malformed, non-JSON and oversized responses without throwing', () => {
    for (const input of [null, 123, {}, '{', 'null', '[]', ' '.repeat(RULE_LIMITS.jsonCharacters + 1)]) expect(parseRuleset(input).ok).toBe(false);
    const almostJSON = JSON.stringify(rescue).replace('8000', 'NaN');
    expect(parseRuleset(almostJSON).ok).toBe(false);
  });

  it('refuses enormous collections before visiting their entries', () => {
    const rules = new Array(1_000_000);
    Object.defineProperty(rules, '0', { get: () => { throw new Error('Oversized entries must not be visited'); } });
    expect(validateRuleset({ ...rescue, rules }).ok).toBe(false);
    expect(validateRuleset({ ...rescue, rules: [{ ...rescue.rules[0], actions: rules }] }).ok).toBe(false);
    expect(validateRuleset({ ...rescue, rules: [{ ...rescue.rules[0], filters: rules }] }).ok).toBe(false);
    expect(validateRuleset({ ...rescue, rules: [{ ...rescue.rules[0], actions: [{ ...rescue.rules[0].actions[0], tags: rules }] }] }).ok).toBe(false);
  });

  it.each(['source', 'sessionId', 'runId', 'wave', 'owner', 'budget', 'generation', 'depth'])('keeps %s outside the generated data contract', field => {
    expect(validateRuleset({ ...rescue, [field]: 1 }).ok).toBe(false);
    expect(validateRuleset({ ...rescue, rules: [{ ...rescue.rules[0], actions: [{ ...rescue.rules[0].actions[0], [field]: 1 }] }] }).ok).toBe(false);
  });

  it('rejects proposed extensions rather than accepting a partly supported set', () => {
    for (const type of ['projectile_hit', 'distance_below', 'knockback', 'projectile_pattern', 'area_hazard']) {
      expect(validateRuleset({ ...haulers, rules: [...haulers.rules, { id: 'unsupported', trigger: { type }, actions: haulers.rules[0].actions }] }).ok).toBe(false);
      expect(validateRuleset({ ...haulers, rules: [{ ...haulers.rules[0], actions: [{ type }] }] }).ok).toBe(false);
    }
  });
});
