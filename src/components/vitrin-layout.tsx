'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import {
  BarChart3,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  Coffee,
  CreditCard,
  Headphones,
  Landmark,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  MessageCircleMore,
  NotebookText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Users,
  UserRound,
  X,
} from 'lucide-react';
import { api, useApp, useResource } from '@/lib/client';
import { digits } from '@/lib/format';
import { MobileNavigation } from './mobile-navigation';

const accountLinks = [
  { href: '/profile', label: 'پروفایل کاربری', icon: UserRound },
  { href: '/orders', label: 'سفارش‌ها', icon: ShoppingBag },
  { href: '/registrations', label: 'ثبت‌نام‌ها', icon: CalendarCheck },
  { href: '/settings', label: 'تنظیمات حساب', icon: Settings },
  { href: '/tickets', label: 'پشتیبانی', icon: Headphones },
];
const accountPages = new Set([
  'profile',
  'orders',
  'registrations',
  'settings',
  'tickets',
  'support',
  'reservations',
  'rewards',
  'addresses',
  'payment',
  'notifications',
  'telegram-settings',
]);
const publicLinks = [
  { href: '/', label: 'صفحه اصلی' },
  { href: '/cafes', label: 'کافه‌ها' },
  { href: '/events', label: 'رویدادها' },
  { href: '/blog', label: 'مقالات' },
];
const footerLinks = [
  publicLinks[0],
  publicLinks[1],
  { href: '/about', label: 'درباره ما' },
  { href: '/contact', label: 'تماس با ما' },
  { href: '/faq', label: 'سوالات متداول' },
];

const MainMenuDialog = createContext<React.RefObject<HTMLDialogElement | null> | null>(null);

export function MapMenuButton({ onBeforeOpen }: { onBeforeOpen?: () => void }) {
  const menu = useContext(MainMenuDialog);
  return (
    <button
      type="button"
      className={
        onBeforeOpen ? 'button secondary explorer-map-menu' : 'icon-button explorer-map-menu'
      }
      aria-label={onBeforeOpen ? 'باز کردن منوی اصلی' : 'باز کردن منو'}
      aria-controls="vitrin-menu"
      onClick={(event) => {
        const showMenu = () => menu?.current?.showModal();
        const sheet = event.currentTarget.closest('dialog');
        if (onBeforeOpen && sheet?.open) {
          sheet.addEventListener('close', showMenu, { once: true });
          onBeforeOpen();
        } else {
          onBeforeOpen?.();
          showMenu();
        }
      }}
    >
      <Menu size={21} />
      {onBeforeOpen && 'منوی اصلی'}
    </button>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="vitrin-wordmark" aria-label="ویترین کافه، صفحه اصلی">
      <img src="/vitrin/logo.svg" alt="ویترین کافه" width={169} height={48} />
    </Link>
  );
}

export function VitrinAuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="vitrin vitrin-auth" id="main-content">
      <div className="vitrin-auth-grid">
        <section className="vitrin-auth-card-area">
          <div className="vitrin-auth-card">
            <img className="vitrin-auth-coffee" src="/vitrin/auth-coffee.svg" alt="" />
            <Wordmark />
            {children}
          </div>
        </section>
        <aside className="vitrin-auth-introduction" aria-label="معرفی ویترین کافه">
          <p>
            <Sparkles size={16} aria-hidden="true" /> عضویت در جامعه‌ی کافه‌دوستان
          </p>
          <div>
            <div className="vitrin-auth-cup">
              <Coffee size={44} strokeWidth={1.4} />
            </div>
            <h2>به ویترین کافه خوش آمدید</h2>
            <p>
              کافه مورد علاقه‌تان را پیدا کنید، سفارش دهید، رزرو کنید و از تجربه‌ای متفاوت لذت
              ببرید.
            </p>
          </div>
          <p>
            <ShieldCheck size={20} aria-hidden="true" /> اطلاعات شما امن و محرمانه می‌ماند
          </p>
        </aside>
      </div>
    </main>
  );
}

export function VitrinLayout({
  children,
  page,
  id,
}: {
  children: ReactNode;
  page: string;
  id?: string;
}) {
  const path = usePathname();
  const query = useSearchParams();
  const router = useRouter();
  const { data, cart, setCart, refresh, toast } = useApp();
  const menu = useRef<HTMLDialogElement>(null);
  const user = data?.user;
  const directory = page === 'cafes' && !id;
  const map = directory && query.get('view') !== 'list';
  const cafeId = page === 'cafes' ? id : query.get('cafe');
  const cartVisible = (page === 'cafes' && Boolean(id)) || page === 'cart';
  const cartCount =
    cartVisible && (!cafeId || cafeId === cart[0]?.cafe_id)
      ? cart.reduce((total, line) => total + line.quantity, 0)
      : 0;
  const account = Boolean(
    user && accountPages.has(page) && !(page === 'orders' && id && !path.endsWith('/invoice')),
  );
  const dashboard = Boolean(
    user && (page === 'dashboard' || page === 'operations' || page === 'admin'),
  );
  const owner = Boolean(user && data?.cafes.some((cafe) => cafe.owner_id === user.id));
  const staff = useResource<{ locations: { id: string }[] }>(
    user && !owner && !data?.platformAdmin ? 'operations' : null,
  );
  const workingCafe =
    page === 'operations' && id ? id : data?.cafes.find((cafe) => cafe.owner_id === user?.id)?.id;
  const dashboardHref = data?.platformAdmin
    ? '/admin'
    : owner
      ? '/dashboard'
      : staff.data?.locations.length
        ? '/operations'
        : '';
  const links = [
    ...publicLinks,
    { href: '/scanner', label: 'اسکن منوی کافه' },
    ...(user
      ? [
          { href: '/profile', label: 'حساب کاربری' },
          { href: '/orders', label: 'سفارش‌ها' },
          ...(dashboardHref ? [{ href: dashboardHref, label: 'ورود به پنل' }] : []),
        ]
      : []),
    footerLinks[2],
    footerLinks[3],
  ];
  const active = (href: string) => path === href || path.startsWith(href + '/');
  const closeMenu = () => menu.current?.close();
  useEffect(() => {
    menu.current?.close();
  }, [path]);

  async function logout() {
    try {
      await api('auth/logout', 'POST', {});
      setCart([]);
      await refresh();
      router.push('/');
    } catch (error) {
      toast((error as Error).message);
    }
  }

  const userLinks = user && (
    <>
      {dashboardHref && (
        <Link href={dashboardHref}>
          <LayoutDashboard size={18} /> ورود به پنل
        </Link>
      )}
      <Link href="/profile">
        <UserRound size={18} /> پروفایل
      </Link>
      <Link href="/settings">
        <Settings size={18} /> تنظیمات
      </Link>
      <Link href="/meetings">
        <CalendarCheck size={18} /> گفتگوها
      </Link>
      <button type="button" onClick={() => void logout()}>
        <LogOut size={18} /> خروج
      </button>
    </>
  );
  const classes = [
    'vitrin',
    'vitrin-public',
    directory && 'vitrin-directory-page',
    map && 'vitrin-map-page',
    page === 'cafes' && id && 'vitrin-cafe-page',
    dashboard && 'vitrin-dashboard-page',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes}>
      <a href="#main-content" className="skip-link">
        رفتن به محتوای اصلی
      </a>
      <header className="vitrin-header">
        <Wordmark />
        <div className="vitrin-header-actions">
          {cartVisible && (
            <Link
              className="vitrin-menu-button vitrin-cart-link"
              href={'/cart' + (cafeId ? '?cafe=' + encodeURIComponent(cafeId) : '')}
              aria-label="سبد خرید"
              aria-current={page === 'cart' ? 'page' : undefined}
            >
              <ShoppingCart size={20} />
              {cartCount > 0 && <span>{digits(cartCount)}</span>}
            </Link>
          )}
          {user ? (
            <details className="vitrin-user-menu" key={path}>
              <summary aria-label="منوی کاربر">
                <Avatar />
                <span>
                  <strong>{user.name}</strong>
                  <small>{owner ? 'مدیریت کافه' : 'کاربر'}</small>
                </span>
                <ChevronDown size={16} />
              </summary>
              <div className="vitrin-user-actions">{userLinks}</div>
            </details>
          ) : (
            <Link className="vitrin-login" href="/login">
              ورود به حساب <LogIn size={19} />
            </Link>
          )}
          <button
            className="vitrin-menu-button"
            type="button"
            aria-label="باز کردن منو"
            aria-controls="vitrin-menu"
            onClick={() => menu.current?.showModal()}
          >
            <Menu size={23} />
          </button>
        </div>
      </header>
      <dialog
        ref={menu}
        className="vitrin-menu-overlay"
        id="vitrin-menu"
        aria-label="منوی اصلی ویترین کافه"
      >
        <div className="vitrin-menu-top">
          <Wordmark />
          <button type="button" onClick={closeMenu}>
            بستن
          </button>
        </div>
        <nav aria-label="پیمایش اصلی">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={closeMenu}
              aria-current={active(href) ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      </dialog>
      <div className={dashboard ? 'vitrin-workspace' : 'vitrin-main-shell'}>
        {dashboard && (
          <WorkspaceNav
            admin={page === 'admin' && Boolean(data?.platformAdmin)}
            cafe={workingCafe}
            owner={owner}
          />
        )}
        <main id="main-content" className={'vitrin-content page-' + page}>
          {dashboard && (
            <nav className="vitrin-workspace-title" aria-label="مسیر صفحه">
              <Link href={page === 'admin' ? '/admin' : '/dashboard'}>داشبورد</Link>
              <span aria-hidden="true">/</span>
              <span>
                {page === 'admin'
                  ? 'مدیریت سامانه'
                  : page === 'operations'
                    ? 'عملیات شعبه'
                    : 'مدیریت کافه'}
              </span>
            </nav>
          )}
          <MainMenuDialog.Provider value={menu}>
            {account ? (
              <AccountLayout onLogout={() => void logout()}>{children}</AccountLayout>
            ) : (
              children
            )}
          </MainMenuDialog.Provider>
        </main>
      </div>
      {!dashboard && <VitrinFooter />}
      <MobileNavigation page={page} />
    </div>
  );
}

function Avatar() {
  const { data } = useApp();
  const user = data?.user;
  return (
    <span className="vitrin-avatar" aria-hidden="true">
      {user?.avatar ? (
        <img src={user.avatar} alt="" />
      ) : (
        user?.name.slice(0, 1) || <UserRound size={20} />
      )}
    </span>
  );
}

function AccountLayout({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const path = usePathname();
  const { data } = useApp();
  const menu = useRef<HTMLDialogElement>(null);
  const accountNav = (
    <>
      <div className="vitrin-account-person">
        <Avatar />
        <div>
          <strong>{data?.user?.name}</strong>
          <small>خوش آمدید به ویترین کافه</small>
        </div>
      </div>
      <nav aria-label="بخش‌های حساب">
        {accountLinks.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => menu.current?.close()}
            aria-current={path === href || path.startsWith(href + '/') ? 'page' : undefined}
          >
            <Icon size={20} /> {label}
          </Link>
        ))}
      </nav>
      <button type="button" className="vitrin-account-logout" onClick={onLogout}>
        <LogOut size={19} /> خروج از حساب
      </button>
    </>
  );
  return (
    <div className="vitrin-account-layout">
      <aside className="vitrin-account-sidebar" aria-label="منوی حساب کاربری">
        {accountNav}
      </aside>
      <div className="vitrin-account-content">
        <button
          className="vitrin-account-toggle button secondary compact"
          type="button"
          onClick={() => menu.current?.showModal()}
        >
          <Menu size={17} /> منوی حساب
        </button>
        {children}
      </div>
      <dialog className="vitrin-account-drawer" ref={menu} aria-label="منوی حساب کاربری">
        <button
          type="button"
          className="icon-button"
          aria-label="بستن منوی حساب"
          onClick={() => menu.current?.close()}
        >
          <X size={20} />
        </button>
        {accountNav}
      </dialog>
    </div>
  );
}

function WorkspaceNav({ admin, cafe, owner }: { admin: boolean; cafe?: string; owner: boolean }) {
  const path = usePathname();
  const query = useSearchParams();
  const branch = cafe ? '/operations/' + encodeURIComponent(cafe) : '';
  const cafeNav = [
    {
      label: 'مرور کلی',
      links: [
        { href: '/dashboard', label: 'داشبورد', icon: LayoutDashboard },
        { href: '/dashboard?tab=orders', label: 'سفارشات', icon: ShoppingBag },
        ...(branch && owner
          ? [{ href: branch + '?tab=cashier', label: 'صندوق', icon: CreditCard }]
          : []),
        { href: '/dashboard?tab=crm', label: 'مشتریان', icon: Users },
      ],
    },
    {
      label: 'گردهمایی‌ها',
      links: [
        ...(branch && owner
          ? [{ href: branch + '?tab=meetings', label: 'جلسات مشتریان', icon: MessageCircleMore }]
          : []),
        { href: '/dashboard?tab=events', label: 'رویدادها', icon: CalendarDays },
      ],
    },
    {
      label: 'عملیات کافه',
      links: [
        { href: '/operations', label: 'شعب', icon: Store },
        { href: '/dashboard?tab=products', label: 'منو و محصولات', icon: Coffee },
        ...(branch && owner
          ? [{ href: branch + '?tab=staff', label: 'کارکنان و دسترسی‌ها', icon: Users }]
          : []),
        { href: '/dashboard?tab=reservations', label: 'رزروها', icon: CalendarCheck },
      ],
    },
    {
      label: 'گزارش و مالی',
      links: [
        { href: '/dashboard?tab=sales', label: 'تحلیل عملکرد', icon: BarChart3 },
        ...(branch && owner
          ? [
              { href: branch + '?tab=payments', label: 'تراکنش‌های پرداخت', icon: CreditCard },
              { href: branch + '?tab=accounting', label: 'درآمد', icon: Landmark },
            ]
          : []),
      ],
    },
  ];
  const adminNav = [
    {
      label: 'مرور کلی',
      links: [
        { href: '/admin', label: 'داشبورد پلتفرم', icon: LayoutDashboard },
        { href: '/admin/cafes', label: 'کافه‌ها', icon: Store },
        { href: '/admin/orders', label: 'سفارشات', icon: ShoppingBag },
        { href: '/admin/users', label: 'کاربران', icon: Users },
      ],
    },
    {
      label: 'محتوا',
      links: [
        { href: '/admin/placements', label: 'جایگاه‌های صفحه اول', icon: Sparkles },
        { href: '/admin/articles', label: 'مقالات', icon: NotebookText },
        { href: '/admin/testimonials', label: 'نظرات کافه‌ها', icon: MessageCircleMore },
      ],
    },
    {
      label: 'پشتیبانی و تنظیمات',
      links: [
        { href: '/admin/tickets', label: 'تیکت‌ها', icon: Headphones },
        { href: '/admin/payments', label: 'تنظیمات پرداخت', icon: CreditCard },
      ],
    },
  ];
  return (
    <aside className="vitrin-workspace-sidebar" aria-label="پیمایش میز کار">
      <Wordmark />
      <nav aria-label="بخش‌های میز کار">
        {(admin ? adminNav : cafeNav).map((group) => (
          <div key={group.label} className="vitrin-workspace-group">
            <p>{group.label}</p>
            {group.links.map(({ href, label, icon: Icon }) => {
              const [route, params] = href.split('?');
              const active =
                path === route && query.get('tab') === new URLSearchParams(params).get('tab');
              return (
                <Link key={href} href={href} aria-current={active ? 'page' : undefined}>
                  <Icon size={17} /> {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <Link href="/profile">
        <UserRound size={18} /> حساب کاربری
      </Link>
    </aside>
  );
}

export function VitrinFooter() {
  const year = new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric',
    timeZone: 'Asia/Tehran',
  }).format(new Date());
  return (
    <footer className="vitrin-footer">
      <div className="vitrin-footer-inner">
        <div className="vitrin-footer-row">
          <div>
            <Wordmark />
            <p>
              ویترین کافه راهنمای شما برای پیدا کردن فضاهای دنج، منوهای تازه و تجربه‌های
              به‌یادماندنی در کافه‌گردی است. از جستجو تا رزرو و سفارش، همه چیز یکجا کنار هم جمع شده.
            </p>
            <nav aria-label="مسیرهای سایت">
              {footerLinks.map(({ href, label }) => (
                <Link key={href} href={href}>
                  {label}
                </Link>
              ))}
            </nav>
          </div>
          <nav aria-label="شرایط و قوانین">
            <Link href="/partnership">شرایط همکاری</Link>
            <Link href="/terms">شرایط و قوانین</Link>
            <Link href="/privacy">حریم خصوصی</Link>
          </nav>
        </div>
        <p className="vitrin-footer-legal">© {year} ویترین کافه. تمامی حقوق محفوظ است.</p>
      </div>
    </footer>
  );
}
