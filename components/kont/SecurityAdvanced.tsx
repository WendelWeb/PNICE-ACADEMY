'use client';

import { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useLocale, useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import {
  IconCheck,
  IconAlertTriangle,
  IconShieldLock,
  IconDeviceLaptop,
  IconDeviceMobile,
  IconClockHour4,
  IconMail,
} from '@tabler/icons-react';
import { buttonClasses } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { SettingsCard, TextInput, FormStatus, type FormStatusValue } from './ui';
import { useConfirm } from './ConfirmDialog';

type UserRes = NonNullable<ReturnType<typeof useUser>['user']>;
export type SessionRes = Awaited<ReturnType<UserRes['getSessions']>>[number];
type TOTPRes = Awaited<ReturnType<UserRes['createTOTP']>>;

function useFmtDate() {
  const locale = useLocale();
  const intl = locale === 'ht' ? 'fr' : locale;
  return (d?: Date | null) =>
    d
      ? new Date(d).toLocaleDateString(intl, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '';
}

/* ---------------- T1: Overview ---------------- */
export function SecurityOverview({ sessionsCount }: { sessionsCount: number | null }) {
  const t = useTranslations('kont.security.overview');
  const { user } = useUser();
  if (!user) return null;

  const methods: string[] = [];
  if (user.passwordEnabled) methods.push(t('password'));
  if (user.externalAccounts.some((a) => a.provider === 'google'))
    methods.push(t('google'));
  const twoFA = user.twoFactorEnabled;

  return (
    <SettingsCard title={t('title')}>
      <dl className="grid gap-4 sm:grid-cols-3">
        <Stat label={t('signInMethod')} value={methods.join(' · ') || '—'} />
        <Stat
          label={t('twoFactor')}
          value={twoFA ? t('on') : t('off')}
          tone={twoFA ? 'teal' : undefined}
        />
        <Stat
          label={t('activeSessions')}
          value={sessionsCount == null ? '…' : t('sessionsCount', { count: sessionsCount })}
        />
      </dl>
      {!twoFA && (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-ochre/[0.08] px-3.5 py-2.5 text-sm text-graphite">
          <IconShieldLock size={18} className="shrink-0 text-ochre" />
          {t('cta')}
        </p>
      )}
    </SettingsCard>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'teal';
}) {
  return (
    <div>
      <dt className="font-mono text-[11px] uppercase tracking-wide text-ink/55">
        {label}
      </dt>
      <dd
        className={cn(
          'mt-1 font-display text-base font-bold',
          tone === 'teal' ? 'text-teal' : 'text-ink',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/* ---------------- T2/T3/T4: 2FA ---------------- */
export function TwoFactorCard() {
  const t = useTranslations('kont.security.twofactor');
  const tc = useTranslations('kont.common');
  const { user } = useUser();
  const { confirm, dialog } = useConfirm();
  const [totp, setTotp] = useState<TOTPRes | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<FormStatusValue>(null);

  if (!user) return null;
  const verifiedPhone = user.phoneNumbers.find(
    (p) => p.verification?.status === 'verified',
  );
  const smsOn = !!verifiedPhone?.reservedForSecondFactor;

  async function startTotp() {
    setBusy(true);
    setStatus(null);
    try {
      setTotp(await user!.createTOTP());
    } catch {
      setStatus({ type: 'error', message: tc('errorGeneric') });
    } finally {
      setBusy(false);
    }
  }

  async function confirmTotp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await user!.verifyTOTP({ code: code.trim() });
      await user!.reload();
      setTotp(null);
      setCode('');
      setStatus({ type: 'success', message: t('enabledMsg') });
    } catch {
      setStatus({ type: 'error', message: t('codeError') });
    } finally {
      setBusy(false);
    }
  }

  function disableTotp() {
    confirm({
      title: t('disable'),
      text: t('disableConfirm'),
      confirmLabel: t('disable'),
      danger: true,
      run: async () => {
        await user!.disableTOTP();
        await user!.reload();
        setStatus({ type: 'success', message: t('disabledMsg') });
      },
    });
  }

  async function enableSms() {
    if (!verifiedPhone) return;
    setBusy(true);
    setStatus(null);
    try {
      await verifiedPhone.makeDefaultSecondFactor();
      await user!.reload();
      setStatus({ type: 'success', message: t('smsEnabledMsg') });
    } catch {
      setStatus({ type: 'error', message: tc('errorGeneric') });
    } finally {
      setBusy(false);
    }
  }

  async function genBackup() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await user!.createBackupCode();
      setCodes(res.codes);
      await user!.reload();
    } catch {
      setStatus({ type: 'error', message: tc('errorGeneric') });
    } finally {
      setBusy(false);
    }
  }

  function regenBackup() {
    confirm({
      title: t('regenerate'),
      text: t('regenerateConfirm'),
      confirmLabel: t('regenerate'),
      danger: true,
      run: async () => {
        const res = await user!.createBackupCode();
        setCodes(res.codes);
        await user!.reload();
      },
    });
  }

  function downloadCodes() {
    if (!codes) return;
    const blob = new Blob([codes.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pnice-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <SettingsCard title={t('title')}>
      {dialog}
      <p className="text-sm text-graphite/70">{t('intro')}</p>

      {/* TOTP */}
      <div className="mt-5">
        <h3 className="font-display text-sm font-bold text-ink">{t('totpTitle')}</h3>
        {user.totpEnabled ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-mono text-xs text-teal">
              <IconCheck size={14} />
              {t('enabled')}
            </span>
            <button
              type="button"
              onClick={disableTotp}
              className="font-mono text-xs text-stampred hover:underline"
            >
              {t('disable')}
            </button>
          </div>
        ) : totp ? (
          <div className="mt-3">
            <p className="text-xs text-graphite/70">{t('totpStep1')}</p>
            <div className="mt-3 inline-block rounded-lg bg-white p-3">
              <QRCodeSVG value={totp.uri || ''} size={148} />
            </div>
            <p className="mt-3 text-xs text-graphite/70">{t('totpSecret')}</p>
            <code className="mt-1 block break-all rounded bg-paper px-2 py-1.5 font-mono text-xs text-ink">
              {totp.secret}
            </code>
            <form onSubmit={confirmTotp} className="mt-3 flex flex-col gap-2 sm:flex-row">
              <TextInput
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t('totpCodeLabel')}
                required
              />
              <button
                type="submit"
                disabled={busy || !code}
                className={buttonClasses('primary', 'md', 'shrink-0')}
              >
                {t('enable')}
              </button>
            </form>
          </div>
        ) : (
          <button
            type="button"
            onClick={startTotp}
            disabled={busy}
            className={buttonClasses('dark', 'md', 'mt-2')}
          >
            {t('enable')}
          </button>
        )}
      </div>

      {/* SMS */}
      <div className="mt-6 border-t border-ink/10 pt-5">
        <h3 className="font-display text-sm font-bold text-ink">{t('smsTitle')}</h3>
        {smsOn ? (
          <span className="mt-2 flex items-center gap-1.5 font-mono text-xs text-teal">
            <IconCheck size={14} />
            {t('smsEnabled')}
          </span>
        ) : verifiedPhone ? (
          <button
            type="button"
            onClick={enableSms}
            disabled={busy}
            className={buttonClasses('dark', 'md', 'mt-2')}
          >
            {t('smsEnable')}
          </button>
        ) : (
          <p className="mt-2 text-xs text-graphite/60">{t('smsNoPhone')}</p>
        )}
      </div>

      {/* Backup codes */}
      {(user.totpEnabled || smsOn) && (
        <div className="mt-6 border-t border-ink/10 pt-5">
          <h3 className="font-display text-sm font-bold text-ink">
            {t('backupTitle')}
          </h3>
          <p className="mt-1 text-xs text-graphite/70">{t('backupIntro')}</p>
          {codes ? (
            <div className="mt-3">
              <ul className="grid grid-cols-2 gap-1.5 rounded-lg bg-paper p-3 font-mono text-xs text-ink sm:grid-cols-3">
                {codes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-stampred">
                <IconAlertTriangle size={13} className="shrink-0" />
                {t('backupWarning')}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={downloadCodes}
                  className={buttonClasses('dark', 'md')}
                >
                  {t('download')}
                </button>
                <button
                  type="button"
                  onClick={regenBackup}
                  className={buttonClasses('ghost', 'md')}
                >
                  {t('regenerate')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={user.backupCodeEnabled ? regenBackup : genBackup}
              disabled={busy}
              className={buttonClasses('dark', 'md', 'mt-2')}
            >
              {user.backupCodeEnabled ? t('regenerate') : t('generate')}
            </button>
          )}
        </div>
      )}
      <FormStatus status={status} />
    </SettingsCard>
  );
}

/* ---------------- T5: Passkeys ---------------- */
export function PasskeysCard() {
  const t = useTranslations('kont.security.passkeys');
  const { user } = useUser();
  const { confirm, dialog } = useConfirm();
  const fmt = useFmtDate();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<FormStatusValue>(null);

  if (!user) return null;

  async function add() {
    setBusy(true);
    setStatus(null);
    try {
      await user!.createPasskey();
      await user!.reload();
      setStatus({ type: 'success', message: t('added') });
    } catch {
      setStatus({ type: 'error', message: t('error') });
    } finally {
      setBusy(false);
    }
  }

  function remove(id: string) {
    const pk = user!.passkeys.find((p) => p.id === id);
    if (!pk) return;
    confirm({
      title: t('remove'),
      text: t('removeConfirm'),
      confirmLabel: t('remove'),
      danger: true,
      run: async () => {
        await pk.delete();
        await user!.reload();
        setStatus({ type: 'success', message: t('removed') });
      },
    });
  }

  return (
    <SettingsCard title={t('title')}>
      {dialog}
      <p className="text-sm text-graphite/70">{t('intro')}</p>

      {user.passkeys.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {user.passkeys.map((pk) => (
            <li
              key={pk.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper px-3.5 py-2.5"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">
                  {pk.name || t('unnamed')}
                </span>
                <span className="font-mono text-[11px] text-graphite/55">
                  {t('addedOn', { date: fmt(pk.createdAt) })}
                </span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(pk.id)}
                className="shrink-0 font-mono text-xs text-stampred hover:underline"
              >
                {t('remove')}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-graphite/55">{t('none')}</p>
      )}

      <button
        type="button"
        onClick={add}
        disabled={busy}
        className={buttonClasses('dark', 'md', 'mt-4')}
      >
        {t('add')}
      </button>
      <FormStatus status={status} />
    </SettingsCard>
  );
}

/* ---------------- T6/T7/T8: Active sessions ---------------- */
export function SessionsCard({
  sessions,
  currentSessionId,
  reload,
}: {
  sessions: SessionRes[] | null;
  currentSessionId: string | null | undefined;
  reload: () => Promise<void>;
}) {
  const t = useTranslations('kont.security.sessions');
  const fmt = useFmtDate();
  const { confirm, dialog } = useConfirm();
  const [status, setStatus] = useState<FormStatusValue>(null);

  function deviceLabel(s: SessionRes) {
    const a = s.latestActivity;
    const parts = [a?.browserName, a?.deviceType].filter(Boolean);
    return parts.join(' · ') || t('unknownDevice');
  }
  function locationLabel(s: SessionRes) {
    const a = s.latestActivity;
    return [a?.city, a?.country].filter(Boolean).join(', ');
  }

  function signOut(s: SessionRes) {
    confirm({
      title: t('signOut'),
      text: t('signOutConfirm'),
      confirmLabel: t('signOut'),
      danger: true,
      run: async () => {
        await s.revoke();
        await reload();
        setStatus({ type: 'success', message: t('signedOut') });
      },
    });
  }

  function signOutAll() {
    confirm({
      title: t('signOutAllTitle'),
      text: t('signOutAllText'),
      confirmLabel: t('signOutAll'),
      danger: true,
      run: async () => {
        const others = (sessions ?? []).filter((s) => s.id !== currentSessionId);
        await Promise.all(others.map((s) => s.revoke()));
        await reload();
        setStatus({ type: 'success', message: t('signedOutAll') });
      },
    });
  }

  const others = (sessions ?? []).filter((s) => s.id !== currentSessionId);

  return (
    <SettingsCard title={t('title')}>
      {dialog}
      <p className="text-xs text-graphite/60">{t('help')}</p>

      <ul className="mt-4 space-y-2">
        {(sessions ?? []).map((s) => {
          const isCurrent = s.id === currentSessionId;
          const Icon = s.latestActivity?.isMobile ? IconDeviceMobile : IconDeviceLaptop;
          return (
            <li
              key={s.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-ink/10 bg-paper px-3.5 py-3"
            >
              <span className="flex min-w-0 gap-3">
                <Icon size={20} className="mt-0.5 shrink-0 text-ink/60" />
                <span className="min-w-0">
                  <span className="block text-sm text-ink">
                    {deviceLabel(s)}
                    {isCurrent && (
                      <span className="ml-2 rounded bg-teal/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-teal">
                        {t('thisDevice')}
                      </span>
                    )}
                  </span>
                  <span className="block font-mono text-[11px] text-graphite/55">
                    {[locationLabel(s), t('lastActive', { date: fmt(s.lastActiveAt) })]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </span>
              {!isCurrent && (
                <button
                  type="button"
                  onClick={() => signOut(s)}
                  className="shrink-0 font-mono text-xs text-stampred hover:underline"
                >
                  {t('signOut')}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {others.length > 0 && (
        <button
          type="button"
          onClick={signOutAll}
          className={buttonClasses('ghost', 'md', 'mt-4')}
        >
          {t('signOutAll')}
        </button>
      )}
      <FormStatus status={status} />
    </SettingsCard>
  );
}

/* ---------------- T9: Login history ----------------
 * Clerk's client SDK exposes only ACTIVE sessions (user.getSessions), not a
 * historical sign-in log. A real 90-day history needs the Clerk Backend API or
 * sign-in webhooks written to our Neon DB (not built yet) — so this stays a
 * documented placeholder rather than faking it with active-session data. */
export function LoginHistoryCard() {
  const t = useTranslations('kont.security.history');
  return (
    <SettingsCard title={t('title')}>
      <p className="text-xs text-graphite/60">{t('help')}</p>
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-ink/15 bg-paper/50 px-3.5 py-3 text-sm text-graphite/70">
        <IconClockHour4 size={18} className="shrink-0 text-ochre" />
        {t('needsBackend')}
      </div>
    </SettingsCard>
  );
}

/* ---------------- T10: Security email notifications ----------------
 * Clerk already sends security notification emails automatically (e.g. password
 * changed, sign-in from a new device), configured per-instance in the Clerk
 * Dashboard (User & Authentication → Email, SMS & notifications). There is no
 * per-user client toggle to re-implement — this card documents what is covered. */
export function SecurityNotice() {
  const t = useTranslations('kont.security.notice');
  return (
    <SettingsCard title={t('title')}>
      <p className="flex items-start gap-2.5 text-sm leading-relaxed text-graphite/80">
        <IconMail size={18} className="mt-0.5 shrink-0 text-teal" />
        {t('text')}
      </p>
    </SettingsCard>
  );
}
