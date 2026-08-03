/**
 * Pure mapping helpers for the Clerk user-sync webhook
 * (app/api/webhooks/clerk/route.ts) — extracted so the mapping is unit-
 * testable without HTTP or a DB (Stage: learner account).
 *
 * The stage's fix: /kont's "Non sou sètifika" field saves `certificateName`
 * into Clerk **unsafeMetadata** (components/kont/ProfileTab.tsx), but the
 * webhook used to ignore `unsafe_metadata` entirely — so the name the
 * learner typed never reached the `users.certificate_name` column that
 * certificate issuance actually reads (lib/learner/progress-actions.ts).
 * `user.updated` now syncs it through.
 *
 * Kept dependency-free (types + pure functions only), like lib/clerk.ts.
 */

export type ClerkWebhookUser = {
  id: string;
  email_addresses?: { id: string; email_address: string }[];
  primary_email_address_id?: string;
  phone_numbers?: { phone_number: string }[];
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  banned?: boolean;
  unsafe_metadata?: Record<string, unknown> | null;
};

/**
 * The learner-chosen certificate name out of Clerk's `unsafe_metadata`, or
 * `null` when absent/blank/not a string. Trimmed — the certificate PDF
 * prints this verbatim.
 */
export function certificateNameFromUnsafeMetadata(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const raw = (meta as Record<string, unknown>).certificateName;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type ClerkUserRowMapping = {
  /** Full column set for a fresh INSERT. */
  values: {
    clerkId: string;
    email: string;
    name: string;
    certificateName: string;
    phone: string | null;
    status: 'active' | 'banned';
  };
  /** Columns to overwrite on conflict (the upsert's SET). `certificateName`
   *  is included ONLY when the learner explicitly chose one in /kont —
   *  otherwise an unrelated profile edit must never clobber it. */
  set: {
    email: string;
    name: string;
    phone: string | null;
    status: 'active' | 'banned';
    certificateName?: string;
  };
};

/** Clerk webhook `user.created`/`user.updated` payload → users-table upsert. */
export function mapClerkUserToDbUser(data: ClerkWebhookUser): ClerkUserRowMapping {
  const email =
    data.email_addresses?.find((e) => e.id === data.primary_email_address_id)?.email_address ??
    data.email_addresses?.[0]?.email_address ??
    '';
  const phone = data.phone_numbers?.[0]?.phone_number ?? null;
  const name =
    [data.first_name, data.last_name].filter(Boolean).join(' ') || data.username || email || data.id;
  const status = data.banned ? ('banned' as const) : ('active' as const);
  const chosenCertificateName = certificateNameFromUnsafeMetadata(data.unsafe_metadata);

  return {
    values: {
      clerkId: data.id,
      email,
      name,
      certificateName: chosenCertificateName ?? name,
      phone,
      status,
    },
    set: {
      email,
      name,
      phone,
      status,
      ...(chosenCertificateName ? { certificateName: chosenCertificateName } : {}),
    },
  };
}
