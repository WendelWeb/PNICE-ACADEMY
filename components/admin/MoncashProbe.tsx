'use client';

/**
 * The MonCash diagnostic console (/admin/moncash).
 *
 * Deliberately raw: it shows MonCash's own words rather than translating them
 * into reassuring UI copy, because its entire job is to answer "what exactly
 * is Digicel saying, and is that our fault or theirs". A polished error state
 * here would destroy the only signal worth having.
 */
import { useState, useTransition } from 'react';
import { IconDeviceMobile, IconRefresh, IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { buttonClasses } from '@/components/ui/Button';
import { moncashProbeAction, moncashCheckAction, type DiagResult } from '@/lib/payments/moncash-diagnostic';

/** MonCash's own messages, explained in plain French for the owner. */
const EXPLAIN: Record<string, string> = {
  forbidden: "Tu n'as pas la permission (roles.manage).",
  not_configured: 'MONCASH_CLIENT_ID / MONCASH_CLIENT_SECRET absents.',
  bad_phone: "Ce numéro n'a pas la forme d'un mobile haïtien. Exemple : 3866 2809",
  bad_amount: 'Montant invalide — il faut un nombre entier de gourdes, supérieur à 0.',
  pending: "Demande envoyée. Regarde ton téléphone : MonCash doit t'y demander de confirmer.",
  successful: 'Paiement confirmé par MonCash.',
};

function explain(detail: string): string | null {
  if (EXPLAIN[detail]) return EXPLAIN[detail];
  if (detail.includes("MFS can't process")) {
    return "Le moteur de paiement de Digicel refuse la transaction. L'authentification et le compte marchand sont OK — il reste une activation côté Digicel (portefeuille sandbox non provisionné, ou compte marchand en attente).";
  }
  if (detail.includes('Please enter your credential')) {
    return 'Le compte marchand (Merchant Account Credential) n’est pas rattaché dans le portail MonCash.';
  }
  if (detail.startsWith('HTTP 401') || detail.includes('invalid_token')) {
    return 'Jeton refusé — les clés API sont mauvaises, ou le jeton (59 s) a expiré entre deux appels.';
  }
  if (detail === 'timeout') return "MonCash n'a pas répondu à temps.";
  return null;
}

export function MoncashProbe({ mode, host }: { mode: string; host: string }) {
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('5');
  const [result, setResult] = useState<DiagResult | null>(null);
  const [check, setCheck] = useState<DiagResult | null>(null);
  const [pending, start] = useTransition();
  const [checking, startCheck] = useTransition();

  const reference = result?.sent?.reference ?? null;
  const isLive = mode === 'live';

  return (
    <div className="space-y-4">
      {/* Mode banner — in live mode this really asks a person for money. */}
      <div
        className={`rounded border p-3 ${
          isLive ? 'border-stampred/50 bg-stampred/[0.07]' : 'border-ink/15 bg-paper-light'
        }`}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink/60">Environnement</p>
        <p className={`font-display text-2xl font-bold ${isLive ? 'text-stampred' : 'text-ink'}`}>
          {isLive ? 'LIVE — argent réel' : 'SANDBOX — argent fictif'}
        </p>
        <p className="mt-1 font-mono text-[11px] text-ink/55">{host}</p>
        {isLive && (
          <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-snug text-stampred">
            <IconAlertTriangle size={15} className="mt-px shrink-0" />
            Une demande envoyée ici débitera réellement le numéro indiqué s’il confirme.
          </p>
        )}
      </div>

      <div className="rounded border border-ink/15 bg-paper-light p-4">
        <label htmlFor="mc-phone" className="block font-mono text-[10px] uppercase tracking-[0.14em] text-ink/60">
          Numéro MonCash à solliciter
        </label>
        <input
          id="mc-phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="3866 2809"
          className="mt-1.5 w-full rounded border border-ink/20 bg-white px-3 py-2.5 font-mono text-base text-ink placeholder:text-ink/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre"
        />
        <p className="mt-1 text-[11px] text-ink/55">
          Toutes les écritures sont acceptées : 3866 2809, +509 3866-2809, 50938662809.
        </p>

        <label
          htmlFor="mc-amount"
          className="mt-4 block font-mono text-[10px] uppercase tracking-[0.14em] text-ink/60"
        >
          Montant (gourdes)
        </label>
        <input
          id="mc-amount"
          type="number"
          min={1}
          step={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1.5 w-40 rounded border border-ink/20 bg-white px-3 py-2.5 font-mono text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre"
        />

        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setResult(null);
            setCheck(null);
            start(async () => {
              setResult(await moncashProbeAction({ phone, amountHtg: Number(amount) }));
            });
          }}
          className={buttonClasses('primary', 'md', 'mt-4 w-full disabled:opacity-60')}
        >
          <IconDeviceMobile size={17} className="mr-2" />
          {pending ? 'Envoi…' : 'Envoyer la demande de paiement'}
        </button>
      </div>

      {result && <ResultCard title="Réponse à l’envoi" r={result} />}

      {reference && result?.ok && (
        <div className="rounded border border-ink/15 bg-paper-light p-4">
          <p className="text-[13px] leading-snug text-ink/75">
            Confirme sur ton téléphone, puis demande à MonCash où en est la transaction.
          </p>
          <button
            type="button"
            disabled={checking}
            onClick={() =>
              startCheck(async () => {
                setCheck(await moncashCheckAction(reference));
              })
            }
            className={buttonClasses('ghost', 'md', 'mt-3 w-full disabled:opacity-60')}
          >
            <IconRefresh size={16} className={`mr-2 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Vérification…' : 'Vérifier le statut'}
          </button>
        </div>
      )}

      {check && <ResultCard title="Statut de la transaction" r={check} />}
    </div>
  );
}

function ResultCard({ title, r }: { title: string; r: DiagResult }) {
  const paid = r.status?.paid ?? false;
  const note = explain(r.detail);
  return (
    <div
      className={`rounded border p-4 ${
        paid
          ? 'border-teal/50 bg-teal/[0.07]'
          : r.ok
            ? 'border-ochre/50 bg-ochre/[0.06]'
            : 'border-stampred/50 bg-stampred/[0.06]'
      }`}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink/60">{title}</p>

      <p className="mt-1 flex items-center gap-1.5 font-display text-xl font-bold text-ink">
        {paid && <IconCheck size={19} className="text-teal" />}
        {r.detail}
      </p>

      {note && <p className="mt-1.5 text-[13px] leading-snug text-ink/75">{note}</p>}

      {r.status && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] text-ink/70">
          <dt>payé</dt>
          <dd className={r.status.paid ? 'text-teal' : ''}>{String(r.status.paid)}</dd>
          <dt>en attente</dt>
          <dd>{String(r.status.pending)}</dd>
          <dt>transaction</dt>
          <dd>{r.status.transactionId ?? '—'}</dd>
          <dt>montant</dt>
          <dd>{r.status.amountHtg ?? '—'} HTG</dd>
        </dl>
      )}

      {r.sent && (
        <details className="mt-3">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.14em] text-ink/50">
            Ce qui a été envoyé (à citer au support Digicel)
          </summary>
          <pre className="mt-2 overflow-x-auto rounded bg-ink/[0.04] p-2 font-mono text-[11px] leading-relaxed text-ink/75">
{JSON.stringify(r.sent, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
