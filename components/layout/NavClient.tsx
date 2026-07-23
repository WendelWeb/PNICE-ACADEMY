'use client';

import { useEffect, useRef, useState } from 'react';
import { IconMenu2, IconX } from '@tabler/icons-react';
import { Link, usePathname } from '@/i18n/routing';
import { LangToggle } from '@/components/LangToggle';
import { buttonClasses } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

type NavLinkItem = { href: '/formations' | '/#pri'; label: string };

/**
 * The interactive shell of the public nav: sticky elevation on scroll
 * (IntersectionObserver sentinel — no scroll listeners), active-link
 * underline, and a mobile menu for the nav links + CTA (which were already
 * sm:-gated before this task). `authSlot` is already-rendered JSX from the
 * server (`Nav.tsx`) — plain composition, not a function prop, so it can
 * cross the server/client boundary — and keeps its original visibility
 * untouched (LangToggle/AdminLink/AvatarLink behavior stays intact).
 */
export function NavClient({
  links,
  cta,
  authSlot,
  openMenuLabel,
  closeMenuLabel,
}: {
  links: NavLinkItem[];
  cta: string;
  authSlot: React.ReactNode;
  openMenuLabel: string;
  closeMenuLabel: string;
}) {
  const pathname = usePathname();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [elevated, setElevated] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => setElevated(!entry.isIntersecting),
      { rootMargin: '-8px 0px 0px 0px', threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Close the mobile panel whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* 0-height sentinel at the true top of the page — leaving the
          viewport (after ~8px of scroll) flips the nav to its elevated
          surface. */}
      <div ref={sentinelRef} aria-hidden="true" className="-mb-px h-px w-full" />
      <header
        className={cn(
          'nav-shell sticky top-0 z-40 border-b border-transparent',
          elevated && 'nav-elevated',
        )}
      >
        <div className="relative mx-auto max-w-page px-6 md:px-8">
          <div className="flex items-center justify-between gap-4 py-3.5">
            <Link
              href="/"
              className="shrink-0 whitespace-nowrap font-display text-lg font-extrabold lowercase leading-none tracking-tight text-ink"
            >
              pnice academy
            </Link>

            <div className="flex items-center gap-2 sm:gap-4 md:gap-6">
              <nav className="hidden items-center gap-4 sm:flex md:gap-6">
                {links.map((link) => {
                  const active =
                    link.href === '/formations' &&
                    (pathname === '/formations' || pathname.startsWith('/formations/'));
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={cn(
                        'nav-link text-sm text-ink/75 transition-colors hover:text-ink',
                        active && 'nav-link-active text-ink',
                      )}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </nav>

              <LangToggle />
              {authSlot}

              <Link
                href="/formations"
                className={buttonClasses('primary', 'sm', 'hidden sm:inline-flex')}
              >
                {cta}
              </Link>

              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-controls="mobile-nav-panel"
                aria-label={open ? closeMenuLabel : openMenuLabel}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-ink/70 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre sm:hidden"
              >
                {open ? <IconX size={20} /> : <IconMenu2 size={20} />}
              </button>
            </div>
          </div>

          {/* Absolutely positioned so opening/closing never shifts layout
              below the nav — animates opacity + transform only. */}
          <div
            id="mobile-nav-panel"
            aria-hidden={!open}
            className={cn(
              'absolute inset-x-0 top-full origin-top rounded-b-xl border-x border-b border-ink/10 bg-paper-light shadow-lg transition-[opacity,transform] duration-200 ease-out sm:hidden',
              open ? 'translate-y-0 opacity-100' : '-translate-y-2 pointer-events-none opacity-0',
            )}
          >
            <nav className="flex flex-col gap-1 px-4 py-4">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  tabIndex={open ? undefined : -1}
                  className="rounded px-2 py-2.5 text-[15px] text-ink/80 transition-colors hover:bg-ink/5 hover:text-ink"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/formations"
                tabIndex={open ? undefined : -1}
                className={buttonClasses('primary', 'md', 'mx-2 mt-1 justify-center')}
              >
                {cta}
              </Link>
            </nav>
          </div>
        </div>
      </header>
    </>
  );
}
