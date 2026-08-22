// Shared helpers for Playwright specs: admin auth via Supabase REST + API seeding.
//
// Auth-dependent tests require TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD
// (fallbacks: ADMIN_EMAIL / ADMIN_PASSWORD) to be set in the environment or
// .env. Without them those suites skip gracefully so `npm test` stays green.

import 'dotenv/config';
import { expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export function getAdminCreds() {
  const email = process.env.TEST_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '';
  const password = process.env.TEST_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || '';
  return { email, password };
}

export function hasAdminCreds() {
  const { email, password } = getAdminCreds();
  return !!(email && password);
}

/** Evaluated once at load: use as `test.skip(!credsConfigured, CREDS_SKIP_REASON)` */
export const credsConfigured = hasAdminCreds();
export const CREDS_SKIP_REASON = 'TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD not set — skipping auth-required test';

/** Password-grant login against Supabase Auth; returns a bearer access token. */
export async function getAccessToken(request) {
  const { email, password } = getAdminCreds();
  if (!email || !password) throw new Error('Admin creds not configured');

  const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const res = await request.post(`${base}/auth/v1/token?grant_type=password`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY || '',
      'Content-Type': 'application/json',
    },
    data: { email, password },
  });
  expect(res.status(), 'Supabase password grant should succeed').toBe(200);
  const data = await res.json();
  return data.access_token;
}

/** Authorization header for privileged API calls. */
export async function getAuthHeaders(request) {
  const token = await getAccessToken(request);
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function fixtureBase64(name) {
  const file = path.join(process.cwd(), 'tests', 'fixtures', name);
  return fs.readFileSync(file).toString('base64');
}

/** Seed a project through POST /api/projects with an authenticated request. */
export async function createProjectViaApi(request, overrides = {}) {
  const id = overrides.id || `pw-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const payload = {
    id,
    name: 'Playwright Test Project',
    client: 'QA Client',
    notes: 'Seeded by automated test',
    imageBase64: 'data:image/jpeg;base64,' + fixtureBase64('test_target.png'),
    videoBase64: 'data:video/mp4;base64,' + fixtureBase64('test_video.mp4'),
    ...overrides,
  };
  const res = await request.post('/api/projects', {
    data: payload,
    headers: await getAuthHeaders(request),
  });
  expect(res.status(), `seed project should be created (${await res.text()})`).toBe(201);
  return { id, ...(await res.json()) };
}

export async function deleteProjectViaApi(request, id) {
  const res = await request.delete(`/api/projects/${id}`, {
    headers: await getAuthHeaders(request),
  });
  return res.ok();
}
