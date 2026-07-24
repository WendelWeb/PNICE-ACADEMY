import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkCronAuth, cronAuthStatus } from '@/lib/cron/auth';

describe('checkCronAuth', () => {
  const ORIGINAL = process.env.CRON_SECRET;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL;
  });

  it('is not_configured (→ 503) when CRON_SECRET is unset', () => {
    delete process.env.CRON_SECRET;
    expect(checkCronAuth('Bearer whatever')).toBe('not_configured');
    expect(checkCronAuth(null)).toBe('not_configured');
    expect(cronAuthStatus(checkCronAuth(null))).toBe(503);
  });

  it('is unauthorized (→ 401) with no Authorization header', () => {
    process.env.CRON_SECRET = 's3cr3t';
    expect(checkCronAuth(null)).toBe('unauthorized');
    expect(cronAuthStatus(checkCronAuth(null))).toBe(401);
  });

  it('is unauthorized (→ 401) with a wrong bearer', () => {
    process.env.CRON_SECRET = 's3cr3t';
    expect(checkCronAuth('Bearer nope')).toBe('unauthorized');
    expect(checkCronAuth('Bearer s3cr3')).toBe('unauthorized'); // prefix, wrong length
    expect(checkCronAuth('s3cr3t')).toBe('unauthorized'); // missing "Bearer " scheme
  });

  it('is ok with the correct bearer', () => {
    process.env.CRON_SECRET = 's3cr3t';
    expect(checkCronAuth('Bearer s3cr3t')).toBe('ok');
    expect(cronAuthStatus('ok')).toBeNull();
  });
});
