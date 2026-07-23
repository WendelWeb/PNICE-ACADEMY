'use client';

import { useState } from 'react';
import { IconArrowRight } from '@tabler/icons-react';
import { useRouter } from '@/i18n/routing';
import { buttonClasses } from '@/components/ui/Button';

/**
 * Simple code entry that hands off to the existing dynamic result page
 * (`/certificats/verifier/[code]`), which already renders the valid /
 * revoked / not-found states.
 */
export function VerifyForm({
  placeholder,
  submitLabel,
}: {
  placeholder: string;
  submitLabel: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    router.push(`/certificats/verifier/${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3 sm:flex-row">
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1 rounded-lg border border-ink/15 bg-paper-light px-4 py-3 font-mono text-sm text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-ochre"
      />
      <button type="submit" className={buttonClasses('primary', 'md', 'justify-center')}>
        {submitLabel}
        <IconArrowRight size={16} />
      </button>
    </form>
  );
}
