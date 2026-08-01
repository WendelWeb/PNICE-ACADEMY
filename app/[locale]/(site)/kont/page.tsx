import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Section, Container } from '@/components/ui/Section';
import { AccountSettings } from '@/components/kont/AccountSettings';
import { clerkEnabled } from '@/lib/clerk';
import { currentUserIsApprovedTeacher } from '@/lib/teacher/profile';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Mon kont — PNICE Academy' };

export default async function AccountPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  // Task: studio access everywhere — same gated, never-throw server check
  // Nav.tsx uses, so /kont's "Mon studio" entry and the nav's studio badge
  // can never disagree on whether the signed-in user is an approved teacher.
  const approvedTeacher = clerkEnabled ? await currentUserIsApprovedTeacher() : false;

  return (
    <Section>
      <Container className="max-w-4xl">
        {clerkEnabled ? (
          <AccountSettings isApprovedTeacher={approvedTeacher} />
        ) : (
          <p className="py-20 text-center font-mono text-sm text-graphite/60">
            Clerk pa konfigire / Clerk non configuré.
          </p>
        )}
      </Container>
    </Section>
  );
}
