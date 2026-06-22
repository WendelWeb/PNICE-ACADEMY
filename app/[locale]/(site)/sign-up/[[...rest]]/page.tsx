import { setRequestLocale } from 'next-intl/server';
import { AuthShell } from '@/components/auth/AuthShell';

export const dynamic = 'force-dynamic';

export default function SignUpPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return <AuthShell mode="signUp" />;
}
