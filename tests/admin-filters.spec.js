// Unit specs for the projects filter/sort helpers in js/utils.js.
// Pure functions — imported directly into Node, no browser or creds needed.

import { test, expect } from '@playwright/test';
import { expType, daysUntil, filterProjects, sortProjects } from '../js/utils.js';

const day = 86400000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();

function p(over = {}) {
  return { id: Math.random().toString(36).slice(2), name: 'P', created_at: iso(-30 * day), ...over };
}

test.describe('expType', () => {
  test('classifies all four modes across camel/snake fields', () => {
    expect(expType({ expiresAt: iso(day), maxScans: 10 })).toBe('both');
    expect(expType({ expires_at: iso(day) })).toBe('time');
    expect(expType({ max_scans: 5 })).toBe('scans');
    expect(expType({})).toBe('permanent');
  });
});

test.describe('filterProjects — status axis', () => {
  const live = p({ expires_at: iso(10 * day), views_count: 1, max_scans: 10 });
  const dead = p({ expires_at: iso(-day) });
  const soon = p({ expiresAt: iso(7 * day - 60000) }); // just inside 7-day window
  const laterSoonish = p({ expiresAt: iso(7 * day + day / 2) }); // outside window

  test('active excludes expired; expired includes only expired', () => {
    const r = filterProjects([live, dead], { status: 'active' });
    expect(r.map(x => x.id)).toEqual([live.id]);
    const r2 = filterProjects([live, dead], { status: 'expired' });
    expect(r2.map(x => x.id)).toEqual([dead.id]);
  });

  test('"soon" includes exactly ≤7 days and excludes already expired', () => {
    const r = filterProjects([live, dead, soon, laterSoonish], { status: 'soon' });
    expect(r.map(x => x.id)).toEqual([soon.id]);
  });

  test('scan-limit expiry counts as expired, not soon', () => {
    const capped = p({ max_scans: 10, views_count: 10, expires_at: iso(9 * day) });
    expect(filterProjects([capped], { status: 'expired' }).map(x => x.id)).toEqual([capped.id]);
    expect(filterProjects([capped], { status: 'soon' })).toHaveLength(0);
  });
});

test.describe('filterProjects — expiration type axis', () => {
  const items = [
    p({ id: 'perm' }),
    p({ id: 'time', expiresAt: iso(day) }),
    p({ id: 'scans', maxScans: 3 }),
    p({ id: 'both', expiresAt: iso(day), maxScans: 3 }),
  ];
  for (const t of ['permanent', 'time', 'scans', 'both']) {
    test(`type=${t} matches exactly one`, () => {
      expect(filterProjects(items, { type: t }).map(x => x.id)).toEqual([t === 'permanent' ? 'perm' : t]);
    });
  }
});

test.describe('filterProjects — client axis', () => {
  test('exact match, trims nothing silently', () => {
    const items = [p({ client: 'Acme Co' }), p({ client: 'Other' }), p({})];
    expect(filterProjects(items, { client: 'Acme Co' })).toHaveLength(1);
    expect(filterProjects(items, { client: 'acme co' })).toHaveLength(0); // case-sensitive exact
    expect(filterProjects(items, { client: 'all' })).toHaveLength(3);
  });
});

test.describe('filterProjects — scan usage axis', () => {
  const items = [
    p({ id: 'never', views_count: 0 }),
    p({ id: 'low', views_count: 3, max_scans: 10 }),
    p({ id: 'near80', views_count: 4, max_scans: 5 }),   // exactly 80% → near
    p({ id: 'atcap', views_count: 10, max_scans: 10 }),  // reached → still "near"
    p({ id: 'nolimit', views_count: 999 }),              // no cap → can never be near
  ];

  test('never = zero scans', () => {
    expect(filterProjects(items, { usage: 'never' }).map(x => x.id)).toEqual(['never']);
  });

  test('has = at least one scan', () => {
    expect(filterProjects(items, { usage: 'has' }).map(x => x.id))
      .toEqual(['low', 'near80', 'atcap', 'nolimit']);
  });

  test('near boundary: ≥80% of cap (integer math)', () => {
    expect(filterProjects(items, { usage: 'near' }).map(x => x.id)).toEqual(['near80', 'atcap']);
  });
});

test.describe('filterProjects — search + created range axes', () => {
  const items = [
    p({ id: 'a', name: 'Wedding Frame', client: 'Sharma', notes: 'gold foil', created_at: new Date().toISOString().slice(0, 10) + 'T06:00:00.000Z' }),
    p({ id: 'b', name: 'Menu Board', notes: 'VIP list inside', created_at: new Date().toISOString().slice(0, 10) + 'T06:00:00.000Z' }),
    p({ id: 'c', name: 'Poster', created_at: iso(-90 * day) }),
  ];

  test('search spans name + client + notes, case-insensitive', () => {
    expect(filterProjects(items, { search: 'sharma' }).map(x => x.id)).toEqual(['a']);
    expect(filterProjects(items, { search: 'vip' }).map(x => x.id)).toEqual(['b']);
    expect(filterProjects(items, { search: 'WEDDING' }).map(x => x.id)).toEqual(['a']);
  });

  test('created range is inclusive on both ends', () => {
    const recent = new Date().toISOString().slice(0, 10);
    expect(filterProjects(items, { from: recent, to: recent }).map(x => x.id))
      .toEqual(['a', 'b']);
  });

  test('inverted range yields empty result', () => {
    expect(filterProjects(items, { from: '2030-01-01', to: '2020-01-01' })).toHaveLength(0);
  });

  test('axes combine with AND logic', () => {
    const both = [
      p({ id: 'hit', name: 'Poster', client: 'X', views_count: 9, max_scans: 10 }),
      p({ id: 'miss-type', name: 'Poster', client: 'X' }),
      p({ id: 'miss-usage', name: 'Poster', client: 'X', views_count: 1, max_scans: 10 }),
      p({ id: 'miss-client', name: 'Poster', client: 'Y', views_count: 9, max_scans: 10 }),
    ];
    expect(filterProjects(both, { type: 'scans', client: 'X', usage: 'near' }).map(x => x.id))
      .toEqual(['hit']);
  });
});

test.describe('sortProjects', () => {
  const a = p({ id: 'a', name: 'Banana', created_at: iso(-3 * day), views_count: 5, expires_at: iso(2 * day), last_scanned_at: iso(-day) });
  const b = p({ id: 'b', name: 'apple', created_at: iso(-day), views_count: 50, expires_at: iso(10 * day), last_scanned_at: iso(-2 * day) });
  const c = p({ id: 'c', name: 'Cherry', created_at: iso(-2 * day), views_count: 0 }); // permanent, never scanned

  test('newest/oldest by created date', () => {
    expect(sortProjects([a, b, c], 'newest').map(x => x.id)).toEqual(['b', 'c', 'a']);
    expect(sortProjects([a, b, c], 'oldest').map(x => x.id)).toEqual(['a', 'c', 'b']);
  });

  test('name_asc is case-insensitive alphabetical', () => {
    expect(sortProjects([a, b, c], 'name_asc').map(x => x.id)).toEqual(['b', 'a', 'c']);
  });

  test('scan counts order both ways', () => {
    expect(sortProjects([a, b, c], 'scans_desc').map(x => x.id)).toEqual(['b', 'a', 'c']);
    expect(sortProjects([a, b, c], 'scans_asc').map(x => x.id)).toEqual(['c', 'a', 'b']);
  });

  test('expiring puts dated-soonest first and permanent last', () => {
    expect(sortProjects([c, b, a], 'expiring').map(x => x.id)).toEqual(['a', 'b', 'c']);
  });

  test('recent_scan puts never-scanned last', () => {
    expect(sortProjects([c, b, a], 'recent_scan').map(x => x.id)).toEqual(['a', 'b', 'c']);
  });

  test('returns a copy — source array untouched', () => {
    const src = [b, a];
    sortProjects(src, 'oldest');
    expect(src.map(x => x.id)).toEqual(['b', 'a']);
  });
});

test.describe('daysUntil', () => {
  test('whole-day ceiling and null for unknown', () => {
    expect(daysUntil(iso(7 * day))).toBe(7);
    expect(daysUntil(iso(-day))).toBeLessThanOrEqual(-1);
    expect(daysUntil(null)).toBeNull();
  });
});
