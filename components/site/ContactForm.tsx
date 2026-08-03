'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { IconCircleCheck, IconSend } from '@tabler/icons-react';
import { buttonClasses } from '@/components/ui/Button';
import {
  FieldShell,
  TextInput,
  TextAreaInput,
  FormStatus,
  type FormStatusValue,
} from '@/components/kont/ui';
import { submitContactMessageAction } from '@/lib/site-actions-public';

/**
 * The /kontak message form (Stage 4) — name / email / message, filed as a
 * support ticket via the public `submitContactMessageAction` (works signed
 * out; see that action's header). Success swaps the whole form for the
 * confirmation state « Nou resevwa mesaj ou — n ap reponn pa imèl. »; a
 * rate-limited or failed call keeps the visitor's text intact and shows the
 * matching friendly error. Reuses the kont form primitives (FieldShell /
 * TextInput / FormStatus) — no new form vocabulary.
 */
export function ContactForm() {
  const t = useTranslations('kontak.form');
  const locale = useLocale();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<FormStatusValue>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const r = await submitContactMessageAction({
        name,
        email,
        message,
        // Stage 6: the ticket-received confirmation email follows the
        // language the visitor was browsing in.
        locale: locale === 'fr' ? 'fr' : 'ht',
      });
      if (r.ok) {
        setSent(true);
        return;
      }
      setStatus({
        type: 'error',
        message: r.message === 'rate_limited' ? t('errRateLimited') : t('errGeneric'),
      });
    });
  };

  if (sent) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-teal/30 bg-teal/[0.06] p-7 text-center"
      >
        <IconCircleCheck size={34} className="mx-auto text-teal" aria-hidden="true" />
        <p className="mt-3 font-display text-xl font-bold text-ink">{t('successTitle')}</p>
        <p className="mt-2 text-sm leading-relaxed text-graphite/85">{t('successBody')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FieldShell id="kontak-name" label={t('nameLabel')}>
        <TextInput
          id="kontak-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          autoComplete="name"
        />
      </FieldShell>
      <FieldShell id="kontak-email" label={t('emailLabel')}>
        <TextInput
          id="kontak-email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={200}
          autoComplete="email"
        />
      </FieldShell>
      <FieldShell id="kontak-message" label={t('messageLabel')} hint={t('messageHint')}>
        <TextAreaInput
          id="kontak-message"
          name="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          minLength={5}
          maxLength={4000}
          rows={5}
        />
      </FieldShell>
      <button
        type="submit"
        disabled={pending}
        className={buttonClasses('primary', 'md', 'w-full sm:w-auto')}
      >
        <IconSend size={16} aria-hidden="true" />
        {pending ? t('sending') : t('submit')}
      </button>
      <FormStatus status={status} />
    </form>
  );
}
