import { getTranslations } from 'next-intl/server';
import { IconBrandGoogle } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Container } from '@/components/ui/Section';
import { Sceau } from '@/components/ui/Sceau';
import { buttonClasses } from '@/components/ui/Button';

function Field({
  id,
  label,
  type = 'text',
  placeholder,
}: {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="font-mono text-[11px] uppercase tracking-wide text-ink/55"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-ink/15 bg-paper-light px-3.5 py-2.5 text-ink outline-none transition-colors placeholder:text-ink/30 focus:border-ochre"
      />
    </div>
  );
}

export async function AuthShell({ mode }: { mode: 'signIn' | 'signUp' }) {
  const t = await getTranslations('auth');
  const isSignUp = mode === 'signUp';
  const title = isSignUp ? t('signUpTitle') : t('signInTitle');

  return (
    <Container className="flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-md rounded-2xl border border-ink/12 bg-paper p-8">
        <div className="flex flex-col items-center text-center">
          <Sceau size="sm" tone="ochre" rotate={-6}>
            <span className="font-display text-base font-black leading-none">
              PA
            </span>
          </Sceau>
          <h1 className="mt-5 font-display text-3xl font-black text-ink">
            {title}
          </h1>
        </div>

        <div className="mt-6 rounded-lg border border-dashed border-ochre/50 bg-ochre/[0.06] px-4 py-3 text-center font-mono text-[11px] leading-relaxed text-graphite/70">
          {t('soon')}
        </div>

        <button
          type="button"
          className={buttonClasses('ghost', 'lg', 'mt-6 w-full')}
        >
          <IconBrandGoogle size={18} />
          {t('continueWith')} Google
        </button>

        <div className="my-5 h-px bg-ink/10" />

        <form className="space-y-4">
          <Field id="email" label={t('email')} type="email" placeholder="ou@imel.com" />
          {isSignUp && (
            <Field id="phone" label={t('phone')} type="tel" placeholder="+509 0000 0000" />
          )}
          <Field id="password" label={t('password')} type="password" placeholder="••••••••" />
          <button
            type="button"
            className={buttonClasses('primary', 'lg', 'w-full')}
          >
            {title}
          </button>
        </form>

        <p className="mt-6 text-center font-mono text-xs text-ink/55">
          {isSignUp ? (
            <Link href="/sign-in" className="text-teal hover:text-ochre">
              {t('signInTitle')}
            </Link>
          ) : (
            <Link href="/sign-up" className="text-teal hover:text-ochre">
              {t('signUpTitle')}
            </Link>
          )}
        </p>
      </div>
    </Container>
  );
}
