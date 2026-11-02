import { writeFileSync } from 'node:fs';
import { getRuleCatalog } from '../src/shared/rules.ts';

const destination = new URL('../docs/rule-catalog.json', import.meta.url);
writeFileSync(destination, JSON.stringify(getRuleCatalog(), null, 2) + '\n');
console.log('Exported docs/rule-catalog.json from the shared validation schema.');
