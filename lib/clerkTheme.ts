import { frFR } from '@clerk/localizations';

// GLOBAL theme — used by all modals (sign-up/sign-in/user profile). Must have a
// SOLID light background + dark text so the modal is readable on its own.
export const clerkAppearance = {
  variables: {
    colorPrimary: '#D98E2B',
    colorText: '#10204A',
    colorTextSecondary: '#6b6b63',
    colorBackground: '#F4F1E9',
    colorInputBackground: '#ffffff',
    colorInputText: '#10204A',
    colorNeutral: '#10204A',
    borderRadius: '0.6rem',
    fontFamily: '"Work Sans", system-ui, sans-serif',
  },
  elements: {
    headerTitle: 'font-display text-ink',
    socialButtonsBlockButton: 'normal-case text-ink border-ink/15 hover:border-ink/35',
    formButtonPrimary:
      'bg-ochre text-[#1b1207] hover:bg-ochre/90 normal-case font-semibold',
    formFieldInput: 'border-ink/15',
    footerActionLink: 'text-teal hover:text-ochre',
    // User profile popover (clic sur l'avatar)
    userButtonPopoverCard: 'border border-ink/10 shadow-xl',
    userButtonPopoverActionButton: 'text-ink hover:bg-ochre/[0.07]',
    userButtonPopoverActionButtonIcon: 'text-teal',
    userPreviewMainIdentifier: 'font-display font-bold text-ink',
    userPreviewSecondaryIdentifier: 'text-graphite/70',
    userButtonPopoverFooter: 'border-t border-ink/5',
  },
};

// EMBEDDED theme — for the sign-in/up rendered inside our branded panel, which
// already supplies the background. Card is transparent there only.
export const clerkEmbeddedAppearance = {
  elements: {
    rootBox: 'w-full',
    cardBox: 'w-full border-none bg-transparent shadow-none',
    card: 'bg-transparent p-0 shadow-none border-none',
    headerTitle: 'font-display text-2xl text-ink',
    headerSubtitle: 'text-graphite/70',
    socialButtonsBlockButton:
      'normal-case text-ink border-ink/15 hover:border-ink/35',
    dividerLine: 'bg-ink/10',
    formButtonPrimary:
      'bg-ochre text-[#1b1207] hover:bg-ochre/90 normal-case font-semibold shadow-none',
    formFieldInput: 'bg-paper-light border-ink/15',
    footerActionLink: 'text-teal hover:text-ochre',
    footer: 'bg-transparent',
  },
};

// Clerk has no native Kreyòl — base on French and override the most visible labels.
const htHT = {
  ...frFR,
  socialButtonsBlockButton: 'Kontinye ak {{provider|titleize}}',
  dividerText: 'oswa',
  formFieldLabel__emailAddress: 'Imèl',
  formFieldLabel__password: 'Modpas',
  formButtonPrimary: 'Kontinye',
  footerActionLink__signIn: 'Konekte',
  footerActionLink__signUp: 'Kreye yon kont',
  signIn: {
    ...frFR.signIn,
    start: {
      ...frFR.signIn?.start,
      title: 'Konekte',
      subtitle: 'pou kontinye sou PNICE Academy',
    },
  },
  signUp: {
    ...frFR.signUp,
    start: {
      ...frFR.signUp?.start,
      title: 'Kreye yon kont',
      subtitle: 'pou kòmanse sou PNICE Academy',
    },
  },
} as typeof frFR;

export function clerkLocalization(locale: string) {
  return locale === 'ht' ? htHT : frFR;
}
