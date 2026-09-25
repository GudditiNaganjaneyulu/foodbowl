import { describe, expect, it } from 'vitest';

describe('environment parsing', () => {
  it('reads the string "false" as false (z.coerce.boolean would read it as true)', async () => {
    process.env.SMTP_SECURE = 'false';
    process.env.EMAIL_NOTIFICATIONS_ENABLED = 'false';
    const { env } = await import('../src/config/env');
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.EMAIL_NOTIFICATIONS_ENABLED).toBe(false);
  });
});
