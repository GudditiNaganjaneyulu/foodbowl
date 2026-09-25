import type { FastifyInstance } from 'fastify';
import { describe } from 'vitest';

export const hasTestDb = Boolean(process.env.TEST_DATABASE_URL);

/** `describe` that is skipped (and says why) unless TEST_DATABASE_URL is set. */
export const describeDb = hasTestDb ? describe : describe.skip;

export const DEV_PASSWORD = 'Password123!';

export const ACCOUNTS = {
  owner: 'owner@foodbowl.local',
  staffOrders: 'staff.orders@foodbowl.local',
  staffMenu: 'staff.menu@foodbowl.local',
  delivery1: 'delivery1@foodbowl.local',
  delivery2: 'delivery2@foodbowl.local',
  customer1: 'customer1@foodbowl.local',
  customer2: 'customer2@foodbowl.local',
  customer3: 'customer3@foodbowl.local',
} as const;

export interface Session {
  token: string;
  userId: string;
  /** Issue a request as this user. */
  req: (method: string, url: string, payload?: unknown) => Promise<{ status: number; body: any }>;
}

export function makeSession(app: FastifyInstance, token: string, userId: string): Session {
  return {
    token,
    userId,
    async req(method, url, payload) {
      const res = await app.inject({
        method: method as 'GET',
        url,
        headers: { authorization: `Bearer ${token}` },
        payload: payload as object | undefined,
      });
      return { status: res.statusCode, body: res.body ? safeJson(res.body) : undefined };
    },
  };
}

export async function login(app: FastifyInstance, email: string, password = DEV_PASSWORD): Promise<Session> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
  if (res.statusCode !== 200) throw new Error(`login failed for ${email}: ${res.statusCode} ${res.body}`);
  const body = JSON.parse(res.body);
  return makeSession(app, body.accessToken, body.user.id);
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Seeded menu ids (apps/api/prisma/seed.ts)
export const SEED = {
  springRolls: 'seed-item-0-0', // $5.99, no modifiers
  butterChicken: 'seed-item-1-0', // $12.99, required "Spice Level", optional "Add-ons"
  spiceGroup: 'seed-modgroup-1-0-0',
  spiceMild: 'seed-modifier-1-0-0-0',
  spiceHot: 'seed-modifier-1-0-0-2',
  addonsGroup: 'seed-modgroup-1-0-1',
  addonExtraChicken: 'seed-modifier-1-0-1-0', // +2.50
  addonExtraGravy: 'seed-modifier-1-0-1-1', // +1.50
  addonNaan: 'seed-modifier-1-0-1-2', // +2.99
  friedRice: 'seed-item-1-2',
  riceGroup: 'seed-modgroup-1-2-0',
  garlicNaan: 'seed-item-2-0', // $2.99 (below the $5 minimum on its own)
} as const;
