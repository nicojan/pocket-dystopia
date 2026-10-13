// data.js is APPEND-ONLY: v2 share links store each trait's index in its
// pool, so a reorder or deletion silently changes every shared link.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const ctx = {};
vm.runInNewContext(`${fs.readFileSync(path.join(root, 'data.js'), 'utf8')}; this.DATA = DATA;`, ctx);
const DATA = ctx.DATA;
const snapshot = JSON.parse(fs.readFileSync(path.join(here, '../fixtures/pool-snapshot.json'), 'utf8'));
const MOODS = ['corporate', 'post-apocalyptic', 'ai-takeover', 'political'];

test.describe('data.js', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'pure data checks run once'));

  test('existing entries are never reordered or removed (append-only)', () => {
    for (const [pool, texts] of Object.entries(snapshot)) {
      expect(DATA[pool], `pool ${pool} was removed`).toBeDefined();
      const current = DATA[pool].map(t => t.text);
      expect(current.slice(0, texts.length), `pool ${pool} changed before its end — append new traits at the END`).toEqual(texts);
    }
  });

  test('pools fit one byte per index, have no duplicates, and use known moods', () => {
    for (const [pool, items] of Object.entries(DATA)) {
      expect(items.length, pool).toBeLessThan(256);
      const texts = items.map(i => i.text);
      expect(new Set(texts).size, `duplicate text in ${pool}`).toBe(texts.length);
      for (const item of items) {
        expect(typeof item.text).toBe('string');
        expect(item.text.length).toBeLessThanOrEqual(200);
        for (const m of item.mood) expect(MOODS, `${pool}: "${item.text}"`).toContain(m);
      }
    }
  });
});
