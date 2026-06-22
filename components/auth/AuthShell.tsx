import { getLocale, getTranslations } from 'next-intl/server';
import { IconBrandGoogle } from '@tabler/icons-react';
import { SignIn, SignUp } from '@clerk/nextjs';
import { Link } from '@/i18n/routing';
import { Container } from '@/components/ui/Section';
import { Sceau } from '@/components/ui/Sceau';
import { SmartImage } from '@/components/ui/SmartImage';
import { siteImageSrc } from '@/lib/courseImage';
import { buttonClasses } from '@/components/ui/Button';
import { clerkEnabled } from '@/lib/clerk';
import { clerkEmbeddedAppearance } from '@/lib/clerkTheme';

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
  const tf = await getTranslations('footer');
  const locale = await getLocale();
  const isSignUp = mode === 'signUp';
  const title = isSignUp ? t('signUpTitle') : t('signInTitle');

  return (
    <Container className="py-12 md:py-16">
      <div className="mx-auto grid max-w-4xl overflow-hidden rounded-2xl border border-ink/12 lg:grid-cols-2">
        {/* brand image panel */}
        <div className="relative hidden min-h-[560px] bg-ink lg:block">
          <SmartImage
            src={siteImageSrc('hero')}
            alt=""
            fill
            sizes="50vw"
            className="object-cover opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/10" />
          <div className="absolute inset-0 flex flex-col justify-between p-8 text-paper-light">
            <div className="flex items-center gap-3">
              <Sceau size="xs" tone="ochre" rotate={-6}>
                PA
              </Sceau>
              <span className="font-display text-lg font-extrabold lowercase tracking-tight">
                pnice academy
              </span>
            </div>
            <p className="font-display text-3xl font-black leading-tight">
              {tf('tagline')}
            </p>
          </div>
        </div>

        {/* form */}
        <div className="flex flex-col justify-center bg-paper p-8 sm:p-10">
          {clerkEnabled ? (
            <div className="flex justify-center lg:justify-start">
              {isSignUp ? (
                <SignUp
                  path={`/${locale}/sign-up`}
                  signInUrl={`/${locale}/sign-in`}
                  appearance={clerkEmbeddedAppearance}
                />
              ) : (
                <SignIn
                  path={`/${locale}/sign-in`}
                  signUpUrl={`/${locale}/sign-up`}
                  appearance={clerkEmbeddedAppearance}
                />
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
                <Sceau size="sm" tone="ochre" rotate={-6} className="lg:hidden">
                  <span className="font-display text-base font-black leading-none">
                    PA
                  </span>
                </Sceau>
                <h1 className="mt-5 font-display text-3xl font-black text-ink lg:mt-0">
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
            </>
          )}
        </div>
      </div>
    </Container>
  );
}
