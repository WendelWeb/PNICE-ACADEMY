'use client';

import { useState } from 'react';
import { useUser, useClerk } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useRouter } from '@/i18n/routing';
import { buttonClasses } from '@/components/ui/Button';
import {
  SettingsCard,
  FieldShell,
  TextInput,
  FormStatus,
  type FormStatusValue,
} from './ui';

export function PrivacyTab() {
  return (
    <div className="space-y-5">
      <ExportCard />
      <DeleteCard />
    </div>
  );
}

/* ---------------- T9: Data export ---------------- */
function ExportCard() {
  const t = useTranslations('kont.privacy.export');
  const { user } = useUser();
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  function exportData() {
    if (!user) return;
    setBusy(true);
    // Structured so Phase 2 backend data can be slotted in without rewriting:
    // add a `backend: { enrollments, payments, certificates }` block once Neon exists.
    const data = {
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        emails: user.emailAddresses.map((e) => e.emailAddress),
        phones: user.phoneNumbers.map((p) => p.phoneNumber),
        connectedAccounts: user.externalAccounts.map((a) => a.provider),
      },
      preferences: user.unsafeMetadata,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pnice-mwen-done.json';
    a.click();
    URL.revokeObjectURL(url);
    setBusy(false);
  }

  return (
    <SettingsCard title={t('title')}>
      <p className="text-sm text-graphite/70">{t('help')}</p>
      <button
        type="button"
        onClick={exportData}
        disabled={busy}
        className={buttonClasses('dark', 'md', 'mt-4')}
      >
        {busy ? t('generating') : t('button')}
      </button>
    </SettingsCard>
  );
}

/* ---------------- T10: Delete account ---------------- */
function DeleteCard() {
  const t = useTranslations('kont.privacy.delete');
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const [confirmEmail, setConfirmEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<FormStatusValue>(null);

  if (!user) return null;
  const primaryEmail = user.primaryEmailAddress?.emailAddress ?? '';
  const matches =
    confirmEmail.trim().length > 0 &&
    confirmEmail.trim().toLowerCase() === primaryEmail.toLowerCase();

  async function doDelete() {
    setBusy(true);
    setStatus(null);
    try {
      // Phase 2: once the Neon backend exists, deleting the Clerk user must also
      // cascade-delete related rows (enrollments, payments, certificates) —
      // handled server-side via a `user.deleted` Clerk webhook. Not built yet.
      await user!.delete();
      await signOut();
      router.push('/');
    } catch {
      setStatus({ type: 'error', message: t('error') });
      setBusy(false);
    }
  }

  return (
    <SettingsCard title={t('title')} className="border-stampred/30">
      <p className="flex items-start gap-2 text-sm leading-relaxed text-graphite">
        <IconAlertTriangle size={18} className="mt-0.5 shrink-0 text-stampred" />
        {t('warning')}
      </p>
      <div className="mt-4">
        <FieldShell
          id="confirmEmail"
          label={t('instruction')}
          hint={primaryEmail}
          error={confirmEmail && !matches ? t('mismatch') : null}
        >
          <TextInput
            id="confirmEmail"
            type="email"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            placeholder={t('placeholder')}
            autoComplete="off"
          />
        </FieldShell>
        <button
          type="button"
          disabled={!matches || busy}
          onClick={doDelete}
          className={buttonClasses(
            'primary',
            'md',
            'mt-4 !bg-stampred !text-paper-light hover:!shadow-stampred/30',
          )}
        >
          {busy ? t('deleting') : t('button')}
        </button>
        <FormStatus status={status} />
      </div>
    </SettingsCard>
  );
}
