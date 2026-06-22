import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Section, Container } from '@/components/ui/Section';
import { AccountSettings } from '@/components/kont/AccountSettings';
import { clerkEnabled } from '@/lib/clerk';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Mon kont — PNICE Academy' };

export default function AccountPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  return (
    <Section>
      <Container className="max-w-4xl">
        {clerkEnabled ? (
          <AccountSettings />
        ) : (
          <p className="py-20 text-center font-mono text-sm text-graphite/60">
            Clerk pa konfigire / Clerk non configuré.
          </p>
        )}
      </Container>
    </Section>
  );
}
