/**
 * Stage: learner account — certificateName sync mapping. /kont's "Non sou
 * sètifika" field writes `certificateName` to Clerk unsafeMetadata; the
 * user.updated webhook (app/api/webhooks/clerk/route.ts) must carry it into
 * `users.certificate_name` — the column issuance actually prints from — and
 * an unrelated profile edit must never clobber a name already chosen.
 */
import { describe, it, expect } from 'vitest';
import {
  certificateNameFromUnsafeMetadata,
  mapClerkUserToDbUser,
  type ClerkWebhookUser,
} from './clerkUserSync';

const base: ClerkWebhookUser = {
  id: 'user_clerk1',
  email_addresses: [
    { id: 'em_2', email_address: 'other@x.com' },
    { id: 'em_1', email_address: 'primary@x.com' },
  ],
  primary_email_address_id: 'em_1',
  first_name: 'Mari',
  last_name: 'Joseph',
};

describe('certificateNameFromUnsafeMetadata', () => {
  it('extracts a trimmed non-empty string', () => {
    expect(certificateNameFromUnsafeMetadata({ certificateName: '  Marie J. Joseph ' })).toBe('Marie J. Joseph');
  });
  it('rejects absent / blank / non-string values', () => {
    expect(certificateNameFromUnsafeMetadata(undefined)).toBeNull();
    expect(certificateNameFromUnsafeMetadata(null)).toBeNull();
    expect(certificateNameFromUnsafeMetadata({})).toBeNull();
    expect(certificateNameFromUnsafeMetadata({ certificateName: '' })).toBeNull();
    expect(certificateNameFromUnsafeMetadata({ certificateName: '   ' })).toBeNull();
    expect(certificateNameFromUnsafeMetadata({ certificateName: 42 })).toBeNull();
    expect(certificateNameFromUnsafeMetadata('string')).toBeNull();
  });
});

describe('mapClerkUserToDbUser', () => {
  it('syncs a chosen certificateName into BOTH the insert values and the upsert set', () => {
    const { values, set } = mapClerkUserToDbUser({
      ...base,
      unsafe_metadata: { certificateName: 'Marie Joseph Pierre' },
    });
    expect(values.certificateName).toBe('Marie Joseph Pierre');
    expect(set.certificateName).toBe('Marie Joseph Pierre');
    expect(values.email).toBe('primary@x.com');
    expect(values.name).toBe('Mari Joseph');
  });

  it('without a chosen name: insert defaults certificateName to the display name, and the upsert set OMITS it (never clobbers)', () => {
    const { values, set } = mapClerkUserToDbUser(base);
    expect(values.certificateName).toBe('Mari Joseph');
    expect('certificateName' in set).toBe(false);
  });

  it('a blank chosen name behaves like no chosen name', () => {
    const { values, set } = mapClerkUserToDbUser({ ...base, unsafe_metadata: { certificateName: '  ' } });
    expect(values.certificateName).toBe('Mari Joseph');
    expect('certificateName' in set).toBe(false);
  });

  it('maps banned → status banned; keeps webhook fallbacks for name/email', () => {
    const { values, set } = mapClerkUserToDbUser({ id: 'user_x', banned: true });
    expect(values.status).toBe('banned');
    expect(set.status).toBe('banned');
    expect(values.email).toBe('');
    expect(values.name).toBe('user_x');
    expect(values.certificateName).toBe('user_x');
  });
});
