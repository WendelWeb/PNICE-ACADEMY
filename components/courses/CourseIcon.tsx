import {
  IconCreditCard,
  IconShoppingCart,
  IconShip,
  IconSpeakerphone,
  IconPalette,
  IconBrandWhatsapp,
  IconDeviceMobileCode,
  IconShieldLock,
  IconPlayerPlay,
  IconBook,
} from '@tabler/icons-react';

const map: Record<string, typeof IconBook> = {
  'credit-card': IconCreditCard,
  'shopping-cart': IconShoppingCart,
  ship: IconShip,
  speakerphone: IconSpeakerphone,
  palette: IconPalette,
  'brand-whatsapp': IconBrandWhatsapp,
  'device-mobile-code': IconDeviceMobileCode,
  'shield-lock': IconShieldLock,
  'player-play': IconPlayerPlay,
};

export function CourseIcon({
  name,
  size = 22,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Icon = map[name] ?? IconBook;
  return <Icon size={size} stroke={1.6} className={className} />;
}
