import Link from 'next/link';
import { Home, ReceiptText, Store, UserRound } from 'lucide-react';

const tabs = [
  { href: '/', icon: Home, label: 'خانه', pages: ['home'] },
  {
    href: '/cafes',
    icon: Store,
    label: 'کافه‌ها',
    pages: ['cafes', 'menu', 'products', 'favorites', 'bill'],
  },
  { href: '/orders', icon: ReceiptText, label: 'سفارش‌ها', pages: ['orders'] },
  {
    href: '/profile',
    icon: UserRound,
    label: 'حساب من',
    pages: ['profile', 'settings', 'addresses', 'payment', 'rewards'],
  },
];

export function MobileNavigation({ page }: { page: string }) {
  return (
    <nav className="bottom-nav" aria-label="پیمایش موبایل">
      {tabs.map(({ href, icon: Icon, label, pages }) => {
        const active = pages.includes(page);
        return (
          <Link
            key={href}
            href={href}
            className={active ? 'active' : ''}
            aria-current={active ? 'page' : undefined}
          >
            <span className="bottom-nav-icon" aria-hidden="true">
              <Icon size={22} strokeWidth={active ? 2 : 1.7} />
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
