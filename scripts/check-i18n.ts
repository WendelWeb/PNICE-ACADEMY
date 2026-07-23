/**
 * i18n parity check (U9) — recursively walks messages/ht.json and
 * messages/fr.json down to their leaf values (ht is the canonical, default
 * locale — PART A5 quality floor: every new/changed key must exist in BOTH
 * files) and diffs the two key-path sets. Objects recurse by key; arrays
 * recurse by index, so a missing FAQ item or an extra facts[] entry in one
 * language surfaces just like a missing object key would.
 *
 * Usage: npm run check:i18n
 * Exits 1 (and prints every gap) if the two catalogs disagree, 0 if they're
 * in parity.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Json = Record<string, unknown>;

function leafPaths(value: unknown, prefix = ''): Set<string> {
  const paths = new Set<string>();

  if (Array.isArray(value)) {
    if (value.length === 0) {
      paths.add(prefix || '(root)');
      return paths;
    }
    value.forEach((item, i) => {
      const path = `${prefix}[${i}]`;
      for (const p of leafPaths(item, path)) paths.add(p);
    });
    return paths;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Json);
    if (entries.length === 0) {
      paths.add(prefix || '(root)');
      return paths;
    }
    for (const [key, child] of entries) {
      const path = prefix ? `${prefix}.${key}` : key;
      for (const p of leafPaths(child, path)) paths.add(p);
    }
    return paths;
  }

  // Primitive leaf (string / number / boolean / null).
  paths.add(prefix || '(root)');
  return paths;
}

function loadMessages(locale: string): Json {
  const filePath = join(process.cwd(), 'messages', `${locale}.json`);
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as Json;
}

function printGaps(title: string, keys: string[]): void {
  console.error(`\n${title} (${keys.length}):`);
  for (const key of keys) console.error(`  - ${key}`);
}

function main(): void {
  const ht = loadMessages('ht');
  const fr = loadMessages('fr');

  const htPaths = leafPaths(ht);
  const frPaths = leafPaths(fr);

  const missingInFr = [...htPaths].filter((p) => !frPaths.has(p)).sort();
  const missingInHt = [...frPaths].filter((p) => !htPaths.has(p)).sort();

  if (missingInFr.length === 0 && missingInHt.length === 0) {
    console.log(`i18n parity OK — ${htPaths.size} leaf keys, ht/fr in sync.`);
    process.exit(0);
  }

  console.error(
    `i18n parity FAILED — ht has ${htPaths.size} leaf keys, fr has ${frPaths.size} leaf keys.`,
  );
  if (missingInFr.length > 0) {
    printGaps('Present in ht.json, missing in fr.json', missingInFr);
  }
  if (missingInHt.length > 0) {
    printGaps('Present in fr.json, missing in ht.json', missingInHt);
  }
  console.error('');
  process.exit(1);
}

main();
