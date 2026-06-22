'use client';

import { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { buttonClasses } from '@/components/ui/Button';
import {
  SettingsCard,
  FieldShell,
  TextInput,
  TextAreaInput,
  SelectInput,
  FormStatus,
  clerkError,
  type FormStatusValue,
  type PniceUnsafeMetadata,
} from './ui';

const COUNTRY_CODES = ['HT', 'US', 'CA', 'FR', 'DO', 'OTHER'] as const;
const PRONOUN_OPTIONS = [
  { kind: 'student', value: 'etidyan' },
  { kind: 'teacher', value: 'pwofesè' },
  { kind: 'other', value: '' },
] as const;
const BIO_MAX = 280;
const MAX_BYTES = 5 * 1024 * 1024;
const OK_TYPES = ['image/jpeg', 'image/png'];

export function ProfileTab() {
  return (
    <div className="space-y-5">
      <PhotoCard />
      <IdentityCard />
      <CertificateCard />
      <DetailsCard />
    </div>
  );
}

/* ---------------- T3: Photo ---------------- */
function PhotoCard() {
  const t = useTranslations('kont.profile.photo');
  const { user } = useUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<FormStatusValue>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setStatus(null);
    if (!OK_TYPES.includes(file.type)) {
      setStatus({ type: 'error', message: t('errorFormat') });
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus({ type: 'error', message: t('errorSize') });
      return;
    }
    setBusy(true);
    try {
      await user.setProfileImage({ file });
      setStatus({ type: 'success', message: t('success') });
    } catch {
      setStatus({ type: 'error', message: t('errorFormat') });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove() {
    if (!user) return;
    setBusy(true);
    setStatus(null);
    try {
      await user.setProfileImage({ file: null });
      setStatus({ type: 'success', message: t('removed') });
    } catch {
      setStatus({ type: 'error', message: t('errorFormat') });
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <SettingsCard title={t('title')}>
      <div className="flex flex-wrap items-center gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={user.imageUrl}
          alt=""
          className="h-20 w-20 shrink-0 rounded-full border border-ink/10 object-cover"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className={buttonClasses('dark', 'md')}
          >
            {busy ? t('uploading') : t('change')}
          </button>
          {user.hasImage && (
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className={buttonClasses('ghost', 'md')}
            >
              {t('remove')}
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png"
            hidden
            onChange={onFile}
          />
        </div>
      </div>
      <p className="mt-3 text-xs text-graphite/60">{t('help')}</p>
      <FormStatus status={status} />
    </SettingsCard>
  );
}

/* ---------------- T4: Name + username ---------------- */
function IdentityCard() {
  const t = useTranslations('kont.profile.identity');
  const tc = useTranslations('kont.common');
  const { user } = useUser();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<FormStatusValue>(null);

  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? '');
    setLastName(user.lastName ?? '');
    setUsername(user.username ?? '');
  }, [user]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setStatus(null);
    setUsernameError(null);
    try {
      await user.update({ firstName, lastName, username });
      setStatus({ type: 'success', message: t('saved') });
    } catch (err) {
      const { code } = clerkError(err);
      if (code === 'form_identifier_exists' || code === 'form_username_exists') {
        setUsernameError(t('usernameTaken'));
      } else {
        setStatus({ type: 'error', message: tc('errorGeneric') });
      }
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <SettingsCard title={t('title')}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldShell id="firstName" label={t('firstName')}>
            <TextInput
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
          </FieldShell>
          <FieldShell id="lastName" label={t('lastName')}>
            <TextInput
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </FieldShell>
        </div>
        <FieldShell
          id="username"
          label={t('username')}
          hint={t('usernameHelp')}
          error={usernameError}
        >
          <TextInput
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </FieldShell>
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

/* ---------------- T5: Certificate name ---------------- */
function CertificateCard() {
  const t = useTranslations('kont.profile.certificate');
  const tc = useTranslations('kont.common');
  const { user } = useUser();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<FormStatusValue>(null);

  useEffect(() => {
    if (!user) return;
    const meta = user.unsafeMetadata as PniceUnsafeMetadata;
    const fallback = [user.firstName, user.lastName].filter(Boolean).join(' ');
    setName(meta?.certificateName ?? fallback);
  }, [user]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setStatus(null);
    try {
      await user.update({
        unsafeMetadata: {
          ...(user.unsafeMetadata as PniceUnsafeMetadata),
          certificateName: name.trim(),
        },
      });
      setStatus({ type: 'success', message: t('saved') });
    } catch {
      setStatus({ type: 'error', message: tc('errorGeneric') });
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <SettingsCard title={t('title')}>
      <form onSubmit={save} className="space-y-4">
        <FieldShell id="certificateName" label={t('label')} hint={t('help')}>
          <TextInput
            id="certificateName"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FieldShell>
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

/* ---------------- T6: Country / city / bio / pronouns ---------------- */
function DetailsCard() {
  const t = useTranslations('kont.profile.details');
  const tc = useTranslations('kont.common');
  const { user } = useUser();
  const [country, setCountry] = useState('HT');
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [pronounKind, setPronounKind] = useState<'student' | 'teacher' | 'other'>(
    'student',
  );
  const [pronounOther, setPronounOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<FormStatusValue>(null);

  useEffect(() => {
    if (!user) return;
    const meta = user.unsafeMetadata as PniceUnsafeMetadata;
    setCountry(meta?.country || 'HT');
    setCity(meta?.city || '');
    setBio(meta?.bio || '');
    const title = meta?.pronounsTitle;
    if (title === 'etidyan') setPronounKind('student');
    else if (title === 'pwofesè') setPronounKind('teacher');
    else if (title) {
      setPronounKind('other');
      setPronounOther(title);
    }
  }, [user]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setStatus(null);
    const pronounsTitle =
      pronounKind === 'student'
        ? 'etidyan'
        : pronounKind === 'teacher'
          ? 'pwofesè'
          : pronounOther.trim();
    try {
      await user.update({
        unsafeMetadata: {
          ...(user.unsafeMetadata as PniceUnsafeMetadata),
          country,
          city: city.trim(),
          bio: bio.trim(),
          pronounsTitle,
        },
      });
      setStatus({ type: 'success', message: t('saved') });
    } catch {
      setStatus({ type: 'error', message: tc('errorGeneric') });
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <SettingsCard title={t('title')}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldShell id="country" label={t('country')}>
            <SelectInput
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              {COUNTRY_CODES.map((code) => (
                <option key={code} value={code}>
                  {t(`countryOptions.${code}`)}
                </option>
              ))}
            </SelectInput>
          </FieldShell>
          <FieldShell id="city" label={t('city')}>
            <TextInput
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={t('cityPlaceholder')}
            />
          </FieldShell>
        </div>

        <FieldShell id="pronouns" label={t('pronouns')}>
          <SelectInput
            id="pronouns"
            value={pronounKind}
            onChange={(e) =>
              setPronounKind(e.target.value as 'student' | 'teacher' | 'other')
            }
          >
            {PRONOUN_OPTIONS.map((o) => (
              <option key={o.kind} value={o.kind}>
                {t(`pronounsOptions.${o.kind}`)}
              </option>
            ))}
          </SelectInput>
          {pronounKind === 'other' && (
            <TextInput
              className="mt-2"
              value={pronounOther}
              onChange={(e) => setPronounOther(e.target.value)}
              placeholder={t('pronounsOtherPlaceholder')}
            />
          )}
        </FieldShell>

        <FieldShell id="bio" label={t('bio')}>
          <TextAreaInput
            id="bio"
            value={bio}
            maxLength={BIO_MAX}
            onChange={(e) => setBio(e.target.value)}
            placeholder={t('bioPlaceholder')}
          />
          <p className="mt-1 text-right font-mono text-[11px] text-graphite/50">
            {bio.length}/{BIO_MAX}
          </p>
        </FieldShell>

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
