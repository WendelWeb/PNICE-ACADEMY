'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import {
  IconDice5,
  IconLoader2,
  IconCheck,
  IconX,
  IconTag,
} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { createPromoCodeAction, checkPromoFreeAction, type CreatePromoInput } from '@/lib/admin/marketing-actions';
import type { DiscountType, PromoAppliesTo } from '@/lib/admin/data';

const inputCls =
  'w-full rounded-lg border border-ink/15 bg-paper px-2.5 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre';
const labelCls = 'mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55';

// 8 chars, uppercase, no visually ambiguous characters (O/0, I/1).
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from({ length: 8 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

export function CreatePromoForm({ courses }: { courses: { slug: string; title: string }[] }) {
  const t = useTranslations('admin.marketing.promos');
  const router = useRouter();
  const [pending, start] = useTransition();

  const [code, setCode] = useState('');
  const [free, setFree] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountType>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [appliesTo, setAppliesTo] = useState<PromoAppliesTo>('all');
  const [courseSlug, setCourseSlug] = useState(courses[0]?.slug ?? '');
  const [maxUses, setMaxUses] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [mode, setMode] = useState<'now' | 'scheduled'>('now');
  const [startsAt, setStartsAt] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // Live uniqueness check (debounced).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const c = code.trim();
    if (!c) {
      setFree(null);
      return;
    }
    setChecking(true);
    const id = setTimeout(async () => {
      const r = await checkPromoFreeAction(c);
      setFree(r.free);
      setChecking(false);
    }, 350);
    return () => clearTimeout(id);
  }, [code]);

  const val = Number(discountValue);
  const valid =
    code.trim().length > 0 &&
    free === true &&
    Number.isFinite(val) &&
    (discountType === 'percent' ? val >= 1 && val <= 100 : val > 0) &&
    (mode === 'now' || !!startsAt);

  const submit = () =>
    start(async () => {
      setErr(null);
      const input: CreatePromoInput = {
        code: code.trim().toUpperCase(),
        discountType,
        discountValue: val,
        appliesTo,
        courseSlug: appliesTo === 'course' ? courseSlug : null,
        maxUses: maxUses.trim() ? Math.max(1, Math.round(Number(maxUses))) : null,
        expiresAt: expiresAt ? new Date(expiresAt + 'T23:59:59').toISOString() : null,
        startsAt: mode === 'scheduled' && startsAt ? new Date(startsAt + 'T00:00:00').toISOString() : null,
        isActive: true,
      };
      const r = await createPromoCodeAction(input);
      if (r.ok) router.push('/admin/marketing/promos');
      else setErr(r.message ?? 'error');
    });

  return (
    <section className="space-y-4 rounded-xl border border-ink/12 bg-paper-light p-5">
      <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
        <IconTag size={13} /> {t('create.title')}
      </h2>

      {/* code + generate */}
      <div>
        <span className={labelCls}>{t('create.code')}</span>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
              placeholder="EX: BIENVENI20"
              className={cn(inputCls, 'pr-8 font-mono uppercase tracking-wide')}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
              {checking ? (
                <IconLoader2 size={15} className="animate-spin text-ink/40" />
              ) : free === true ? (
                <IconCheck size={15} className="text-teal" />
              ) : free === false ? (
                <IconX size={15} className="text-stampred" />
              ) : null}
            </span>
          </div>
          <button type="button" onClick={() => setCode(genCode())} className={cn(buttonClasses('ghost', 'md'), 'text-xs')}>
            <IconDice5 size={15} /> {t('create.generate')}
          </button>
        </div>
        {free === false && <p className="mt-1 font-mono text-[11px] text-stampred">{t('create.taken')}</p>}
      </div>

      {/* discount */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelCls}>{t('create.discountType')}</span>
          <select value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)} className={cn(inputCls, 'cursor-pointer')}>
            <option value="percent">{t('type.percent')}</option>
            <option value="fixed">{t('type.fixed')}</option>
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>{discountType === 'percent' ? t('create.valuePercent') : t('create.valueFixed')}</span>
          <input
            type="number"
            min={discountType === 'percent' ? 1 : 1}
            max={discountType === 'percent' ? 100 : undefined}
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            placeholder={discountType === 'percent' ? '20' : '10'}
            className={cn(inputCls, 'font-mono tabular-nums')}
          />
        </label>
      </div>

      {/* applies to */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelCls}>{t('create.appliesTo')}</span>
          <select value={appliesTo} onChange={(e) => setAppliesTo(e.target.value as PromoAppliesTo)} className={cn(inputCls, 'cursor-pointer')}>
            <option value="all">{t('applies.all')}</option>
            <option value="subscription">{t('applies.subscription')}</option>
            <option value="course">{t('applies.course')}</option>
          </select>
        </label>
        {appliesTo === 'course' && (
          <label className="block">
            <span className={labelCls}>{t('create.course')}</span>
            <select value={courseSlug} onChange={(e) => setCourseSlug(e.target.value)} className={cn(inputCls, 'cursor-pointer')}>
              {courses.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* limits */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelCls}>{t('create.maxUses')}</span>
          <input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder={t('create.unlimited')} className={cn(inputCls, 'font-mono tabular-nums')} />
        </label>
        <label className="block">
          <span className={labelCls}>{t('create.expiresAt')}</span>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={cn(inputCls, 'cursor-pointer font-mono')} />
        </label>
      </div>

      {/* activation */}
      <div>
        <span className={labelCls}>{t('create.activation')}</span>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-ink/80">
            <input type="radio" checked={mode === 'now'} onChange={() => setMode('now')} /> {t('create.activeNow')}
          </label>
          <label className="flex items-center gap-1.5 text-sm text-ink/80">
            <input type="radio" checked={mode === 'scheduled'} onChange={() => setMode('scheduled')} /> {t('create.scheduled')}
          </label>
          {mode === 'scheduled' && (
            <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={cn(inputCls, 'w-auto cursor-pointer font-mono')} />
          )}
        </div>
      </div>

      {err && <p className="font-mono text-[11px] text-stampred">{err === 'duplicate' ? t('create.taken') : err}</p>}

      <div className="flex items-center gap-2">
        <button type="button" disabled={!valid || pending} onClick={submit} className={cn(buttonClasses('primary', 'md'), 'text-xs')}>
          {pending ? <IconLoader2 size={14} className="animate-spin" /> : <IconTag size={14} />} {t('create.submit')}
        </button>
      </div>
    </section>
  );
}
