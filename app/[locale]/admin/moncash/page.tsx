/**
 * /admin/moncash — MonCash diagnostic console.
 *
 * A probe, not a checkout: it pushes a real cash-out request to a phone number
 * and shows Digicel's raw answer. Nothing here grants course access or records
 * a payment, so it can never become a back door.
 *
 * Gated on `roles.manage` (owner-level, same as /admin/taux and /admin/prix)
 * because it can make any phone ring with a payment request. The server
 * actions re-check the same capability themselves — a page gate alone is not
 * a security boundary.
 */
import { setRequestLocale } from 'next-intl/server';
import { IconAlertTriangle } from '@tabler/icons-react';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { MoncashProbe } from '@/components/admin/MoncashProbe';
import { moncashConfigured, moncashMode, moncashHost } from '@/lib/payments/moncash';

export const dynamic = 'force-dynamic';

export default async function MoncashDiagnosticPage({
  params: { locale },
}: {
  params: { locale: 'ht' | 'fr' };
}) {
  setRequestLocale(locale);
  if (!(await hasCap('roles.manage'))) return <Forbidden />;

  const configured = moncashConfigured();

  return (
    <div className="mx-auto max-w-[720px] space-y-4">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink/50">Diagnostic</p>
        <h1 className="font-display text-3xl font-bold text-ink">MonCash</h1>
        <p className="mt-1 text-[14px] leading-snug text-ink/70">
          Envoie une vraie demande de paiement à un numéro et regarde ce que Digicel répond, étape par
          étape. Cette page ne vend rien et n’ouvre aucun accès à un cours — elle sert uniquement à
          savoir si l’intégration peut débiter.
        </p>
      </header>

      {configured ? (
        <MoncashProbe mode={moncashMode()} host={moncashHost()} />
      ) : (
        <div className="flex items-start gap-2 rounded border border-stampred/50 bg-stampred/[0.06] p-4">
          <IconAlertTriangle size={18} className="mt-px shrink-0 text-stampred" />
          <div>
            <p className="font-display text-lg font-bold text-ink">Clés MonCash absentes</p>
            <p className="mt-1 text-[13px] leading-snug text-ink/75">
              Renseigne <code className="font-mono text-[12px]">MONCASH_CLIENT_ID</code> et{' '}
              <code className="font-mono text-[12px]">MONCASH_CLIENT_SECRET</code> (plus{' '}
              <code className="font-mono text-[12px]">MONCASH_MODE</code>) puis redéploie.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
