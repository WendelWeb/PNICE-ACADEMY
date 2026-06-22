'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { IconCheck, IconBrandGoogle, IconBrandApple } from '@tabler/icons-react';
import { buttonClasses } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import {
  SettingsCard,
  FieldShell,
  TextInput,
  FormStatus,
  clerkError,
  type FormStatusValue,
} from './ui';
import {
  SecurityOverview,
  TwoFactorCard,
  PasskeysCard,
  SessionsCard,
  LoginHistoryCard,
  SecurityNotice,
  type SessionRes,
} from './SecurityAdvanced';

type UserRes = NonNullable<ReturnType<typeof useUser>['user']>;
type EmailRes = UserRes['emailAddresses'][number];
type PhoneRes = UserRes['phoneNumbers'][number];

export function SecurityTab() {
  const { user } = useUser();
  const { sessionId } = useAuth();
  const [sessions, setSessions] = useState<SessionRes[] | null>(null);

  const reloadSessions = useCallback(async () => {
    if (user) setSessions(await user.getSessions());
  }, [user]);

  useEffect(() => {
    reloadSessions();
  }, [reloadSessions]);

  return (
    <div className="space-y-5">
      <SecurityOverview sessionsCount={sessions?.length ?? null} />
      <EmailsCard />
      <PhoneCard />
      <PasswordCard />
      <TwoFactorCard />
      <PasskeysCard />
      <SessionsCard
        sessions={sessions}
        currentSessionId={sessionId}
        reload={reloadSessions}
      />
      <LoginHistoryCard />
      <ConnectedCard />
      <SecurityNotice />
    </div>
  );
}

/* ---------------- T7: Emails ---------------- */
function EmailsCard() {
  const t = useTranslations('kont.security.emails');
  const tc = useTranslations('kont.common');
  const { user } = useUser();
  const [newEmail, setNewEmail] = useState('');
  const [pending, setPending] = useState<EmailRes | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<FormStatusValue>(null);

  if (!user) return null;
  const primaryId = user.primaryEmailAddressId;

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await user!.createEmailAddress({ email: newEmail.trim() });
      await res.prepareVerification({ strategy: 'email_code' });
      setPending(res);
      setStatus({ type: 'success', message: t('codeSent') });
    } catch (err) {
      const { code: c } = clerkError(err);
      setStatus({
        type: 'error',
        message: c === 'form_identifier_exists' ? t('errorExists') : tc('errorGeneric'),
      });
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) return;
    setBusy(true);
    setStatus(null);
    try {
      await pending.attemptVerification({ code: code.trim() });
      await user!.reload();
      setPending(null);
      setNewEmail('');
      setCode('');
      setStatus({ type: 'success', message: t('addedVerified') });
    } catch {
      setStatus({ type: 'error', message: t('errorCode') });
    } finally {
      setBusy(false);
    }
  }

  async function setPrimary(id: string) {
    setBusy(true);
    setStatus(null);
    try {
      await user!.update({ primaryEmailAddressId: id });
      setStatus({ type: 'success', message: t('madePrimary') });
    } catch {
      setStatus({ type: 'error', message: tc('errorGeneric') });
    } finally {
      setBusy(false);
    }
  }

  async function remove(email: EmailRes) {
    setBusy(true);
    setStatus(null);
    try {
      await email.destroy();
      await user!.reload();
      setStatus({ type: 'success', message: t('removed') });
    } catch {
      setStatus({ type: 'error', message: tc('errorGeneric') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsCard title={t('title')}>
      <ul className="space-y-2">
        {user.emailAddresses.map((email) => {
          const isPrimary = email.id === primaryId;
          const verified = email.verification?.status === 'verified';
          return (
            <li
              key={email.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper px-3.5 py-2.5"
            >
              <span className="min-w-0 break-all text-sm text-ink">
                {email.emailAddress}
                {isPrimary && (
                  <span className="ml-2 rounded bg-ochre/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ochre">
                    {t('primaryBadge')}
                  </span>
                )}
                {!verified && (
                  <span className="ml-2 font-mono text-[11px] text-stampred">
                    {t('pending')}
                  </span>
                )}
              </span>
              {!isPrimary && (
                <span className="flex shrink-0 gap-1.5">
                  {verified && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPrimary(email.id)}
                      className="font-mono text-xs text-teal hover:text-ochre"
                    >
                      {t('setPrimary')}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(email)}
                    className="font-mono text-xs text-stampred hover:underline"
                  >
                    {t('remove')}
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-5 border-t border-ink/10 pt-5">
        <p className="mb-3 font-display text-sm font-bold text-ink">
          {t('addTitle')}
        </p>
        {!pending ? (
          <form onSubmit={sendCode} className="flex flex-col gap-2 sm:flex-row">
            <TextInput
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder={t('addPlaceholder')}
              required
            />
            <button
              type="submit"
              disabled={busy || !newEmail}
              className={buttonClasses('dark', 'md', 'shrink-0')}
            >
              {t('sendCode')}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-2 sm:flex-row">
            <TextInput
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('codeLabel')}
              required
            />
            <button
              type="submit"
              disabled={busy || !code}
              className={buttonClasses('primary', 'md', 'shrink-0')}
            >
              {t('verify')}
            </button>
          </form>
        )}
        <FormStatus status={status} />
      </div>
    </SettingsCard>
  );
}

/* ---------------- T8: Phone ---------------- */
function PhoneCard() {
  const t = useTranslations('kont.security.phone');
  const tc = useTranslations('kont.common');
  const { user } = useUser();
  const [newPhone, setNewPhone] = useState('+509');
  const [pending, setPending] = useState<PhoneRes | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<FormStatusValue>(null);

  if (!user) return null;

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await user!.createPhoneNumber({ phoneNumber: newPhone.trim() });
      await res.prepareVerification();
      setPending(res);
      setStatus({ type: 'success', message: t('codeSent') });
    } catch {
      setStatus({ type: 'error', message: tc('errorGeneric') });
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) return;
    setBusy(true);
    setStatus(null);
    try {
      await pending.attemptVerification({ code: code.trim() });
      await user!.reload();
      setPending(null);
      setNewPhone('+509');
      setCode('');
      setStatus({ type: 'success', message: t('verified') });
    } catch {
      setStatus({ type: 'error', message: t('errorCode') });
    } finally {
      setBusy(false);
    }
  }

  async function remove(phone: PhoneRes) {
    setBusy(true);
    setStatus(null);
    try {
      await phone.destroy();
      await user!.reload();
      setStatus({ type: 'success', message: t('removed') });
    } catch {
      setStatus({ type: 'error', message: tc('errorGeneric') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsCard title={t('title')}>
      {user.phoneNumbers.length > 0 && (
        <ul className="mb-5 space-y-2">
          {user.phoneNumbers.map((phone) => {
            const verified = phone.verification?.status === 'verified';
            return (
              <li
                key={phone.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper px-3.5 py-2.5"
              >
                <span className="text-sm text-ink">
                  {phone.phoneNumber}
                  <span
                    className={cn(
                      'ml-2 font-mono text-[11px]',
                      verified ? 'text-teal' : 'text-stampred',
                    )}
                  >
                    {verified ? t('verified') : t('pending')}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(phone)}
                  className="font-mono text-xs text-stampred hover:underline"
                >
                  {t('remove')}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mb-3 font-display text-sm font-bold text-ink">
        {t('addTitle')}
      </p>
      {!pending ? (
        <form onSubmit={sendCode} className="flex flex-col gap-2 sm:flex-row">
          <FieldShell id="phone" label={t('label')}>
            <TextInput
              id="phone"
              type="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="+509 0000 0000"
            />
          </FieldShell>
          <button
            type="submit"
            disabled={busy}
            className={buttonClasses('dark', 'md', 'shrink-0 self-end')}
          >
            {t('sendCode')}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-2 sm:flex-row">
          <TextInput
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('codeLabel')}
            required
          />
          <button
            type="submit"
            disabled={busy || !code}
            className={buttonClasses('primary', 'md', 'shrink-0')}
          >
            {t('verify')}
          </button>
        </form>
      )}
      <FormStatus status={status} />
    </SettingsCard>
  );
}

/* ---------------- T9: Password ---------------- */
function PasswordCard() {
  const t = useTranslations('kont.security.password');
  const tc = useTranslations('kont.common');
  const { user } = useUser();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<FormStatusValue>(null);
  const rules = t.raw('rules') as string[];

  if (!user) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (next !== confirm) {
      setStatus({ type: 'error', message: t('mismatch') });
      return;
    }
    setBusy(true);
    try {
      await user!.updatePassword({
        currentPassword: current,
        newPassword: next,
        signOutOfOtherSessions: signOutOthers,
      });
      setCurrent('');
      setNext('');
      setConfirm('');
      setStatus({ type: 'success', message: t('saved') });
    } catch (err) {
      const { code } = clerkError(err);
      const msg =
        code === 'form_password_incorrect'
          ? t('wrongCurrent')
          : code?.startsWith('form_password')
            ? t('weak')
            : tc('errorGeneric');
      setStatus({ type: 'error', message: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsCard title={t('title')}>
      <div className="mb-4 rounded-lg bg-paper p-3.5">
        <p className="font-mono text-[11px] uppercase tracking-wide text-ink/55">
          {t('rulesTitle')}
        </p>
        <ul className="mt-2 space-y-1">
          {rules.map((rule, i) => (
            <li
              key={i}
              className="flex items-center gap-1.5 text-xs text-graphite/75"
            >
              <IconCheck size={13} className="shrink-0 text-teal" />
              {rule}
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={save} className="space-y-4">
        <FieldShell id="current" label={t('current')}>
          <TextInput
            id="current"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
          />
        </FieldShell>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldShell id="newpw" label={t('new')}>
            <TextInput
              id="newpw"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              required
            />
          </FieldShell>
          <FieldShell id="confirmpw" label={t('confirm')}>
            <TextInput
              id="confirmpw"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </FieldShell>
        </div>

        <label className="flex items-start gap-2.5 text-sm text-graphite">
          <input
            type="checkbox"
            checked={signOutOthers}
            onChange={(e) => setSignOutOthers(e.target.checked)}
            className="mt-1 h-4 w-4 accent-ochre"
          />
          <span>
            {t('signOutOthers')}
            <span className="block text-xs text-graphite/55">
              {t('signOutOthersHelp')}
            </span>
          </span>
        </label>

        <div>
          <button
            type="submit"
            disabled={busy}
            className={buttonClasses('primary', 'md')}
          >
            {busy ? tc('saving') : tc('save')}
          </button>
          <FormStatus status={status} />
        </div>
      </form>
    </SettingsCard>
  );
}

/* ---------------- T10: Connected accounts ---------------- */
function ConnectedCard() {
  const t = useTranslations('kont.security.connected');
  const tc = useTranslations('kont.common');
  const { user } = useUser();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<FormStatusValue>(null);

  if (!user) return null;
  const google = user.externalAccounts.find((a) => a.provider === 'google');

  async function linkGoogle() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await user!.createExternalAccount({
        strategy: 'oauth_google',
        redirectUrl: window.location.href,
      });
      const url = res.verification?.externalVerificationRedirectURL;
      if (url) window.location.href = url.toString();
    } catch {
      setStatus({ type: 'error', message: tc('errorGeneric') });
      setBusy(false);
    }
  }

  async function unlinkGoogle() {
    if (!google) return;
    setBusy(true);
    setStatus(null);
    try {
      await google.destroy();
      await user!.reload();
      setStatus({ type: 'success', message: t('unlinked') });
    } catch {
      setStatus({ type: 'error', message: tc('errorGeneric') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsCard title={t('title')}>
      <ul className="space-y-2">
        <li className="flex items-center justify-between gap-3 rounded-lg border border-ink/10 bg-paper px-3.5 py-3">
          <span className="flex items-center gap-3">
            <IconBrandGoogle size={20} className="text-ink/70" />
            <span>
              <span className="block text-sm font-medium text-ink">Google</span>
              <span
                className={cn(
                  'font-mono text-[11px]',
                  google ? 'text-teal' : 'text-graphite/55',
                )}
              >
                {google ? `${t('linked')} · ${google.emailAddress}` : t('notLinked')}
              </span>
            </span>
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={google ? unlinkGoogle : linkGoogle}
            className={
              google
                ? 'font-mono text-xs text-stampred hover:underline'
                : buttonClasses('dark', 'md', 'shrink-0')
            }
          >
            {google ? t('unlink') : t('link')}
          </button>
        </li>

        <li className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-ink/15 bg-paper/50 px-3.5 py-3">
          <span className="flex items-center gap-3">
            <IconBrandApple size={20} className="text-ink/40" />
            <span className="block text-sm font-medium text-ink/50">Apple</span>
          </span>
          <span className="rounded bg-ink/5 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-ink/45">
            {t('appleSoon')}
          </span>
        </li>
      </ul>
      <FormStatus status={status} />
    </SettingsCard>
  );
}
