'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  Home,
  Store,
  ReceiptText,
  UserRound,
  Heart,
  CalendarDays,
  CalendarCheck,
  Headphones,
  Settings,
  Bell,
  ShoppingBag,
  Search,
  MapPin,
  ChevronDown,
  ArrowUpLeft,
  LogIn,
  Sun,
  Moon,
  ScanLine,
  Menu,
  X,
  LayoutDashboard,
} from 'lucide-react';
import { useApp } from '@/lib/client';
import { digits } from '@/lib/format';
import { Brand, ErrorBox, Loading } from './ui';
import {
  HomeView,
  CafesView,
  CafeView,
  MenuView,
  ProductView,
  EventsView,
  InfoView,
  ScannerView,
} from './discovery';
import {
  AuthView,
  ProfileView,
  SettingsView,
  AddressView,
  PaymentView,
  RewardsView,
  NotificationsView,
  SupportView,
} from './account';
import { CartView, OrdersView, ReserveView, ReservationsView } from './orders';
import { DashboardView } from './dashboard';

const navigation = [
  { href: '/', label: 'خانه', icon: Home },
  { href: '/cafes', label: 'کافه‌گردی', icon: Store },
  { href: '/menu', label: 'منوی کافه‌ها', icon: ShoppingBag },
  { href: '/orders', label: 'سفارش‌های من', icon: ReceiptText },
  { href: '/reservations', label: 'رزروهای من', icon: CalendarCheck },
  { href: '/favorites', label: 'علاقه‌مندی‌ها', icon: Heart },
  { href: '/events', label: 'رویدادها', icon: CalendarDays },
];
export function Application() {
  const path = usePathname(),
    router = useRouter(),
    query = useSearchParams();
  const { data, loading, error, refresh, cart, theme, setTheme } = useApp();
  const [mobile, setMobile] = useState(false),
    [search, setSearch] = useState('');
  useEffect(() => {
    setMobile(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [path]);
  const segments = path.split('/').filter(Boolean),
    page = segments[0] || 'home',
    id = segments[1];
  const auth = ['login', 'register', 'verify', 'forgot-password', 'reset-password'].includes(page);
  const unread = data?.notifications.filter((n) => !n.read).length || 0;
  let view;
  switch (page) {
    case 'home':
      view = <HomeView />;
      break;
    case 'cafes':
      view = id ? <CafeView key={id} id={id} /> : <CafesView />;
      break;
    case 'favorites':
      view = <CafesView favorites />;
      break;
    case 'menu':
      view = <MenuView />;
      break;
    case 'products':
      view = <ProductView key={id} id={id} />;
      break;
    case 'cart':
      view = <CartView />;
      break;
    case 'orders':
      view = <OrdersView id={id} />;
      break;
    case 'reserve':
      view = <ReserveView />;
      break;
    case 'reservations':
      view = <ReservationsView />;
      break;
    case 'profile':
      view = <ProfileView />;
      break;
    case 'settings':
      view = <SettingsView />;
      break;
    case 'addresses':
      view = <AddressView />;
      break;
    case 'payment':
      view = <PaymentView />;
      break;
    case 'rewards':
      view = <RewardsView />;
      break;
    case 'notifications':
      view = <NotificationsView />;
      break;
    case 'support':
      view = <SupportView />;
      break;
    case 'dashboard':
      view = <DashboardView />;
      break;
    case 'events':
      view = <EventsView id={id} />;
      break;
    case 'scan':
      view = <ScannerView />;
      break;
    default:
      view = auth ? <AuthView key={page} page={page} /> : <InfoView page={page} />;
  }
  if (auth)
    return (
      <div className="auth-layout">
        <div className="auth-visual">
          <Brand />
          <div>
            <span className="eyebrow">یک فنجان، هزار بهانه برای دیدار</span>
            <h1>
              لحظه‌های خوب،
              <br />
              از یک قرار شروع می‌شوند.
            </h1>
            <img src="/images/hero.webp" alt="قهوه و شیرینی ویترین کافه" />
          </div>
          <p>کشف کافه‌های شهر، رزرو میز و تجربه طعم‌های تازه</p>
        </div>
        <div className="auth-content">
          <Link href="/" className="back-link">
            بازگشت به خانه <ArrowUpLeft size={18} />
          </Link>
          <Brand small />
          {view}
        </div>
      </div>
    );
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        رفتن به محتوای اصلی
      </a>
      {mobile && (
        <button
          aria-label="بستن منو"
          className="sidebar-backdrop"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={'sidebar ' + (mobile ? 'is-open' : '')}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-close"
            onClick={() => setMobile(false)}
            aria-label="بستن منو"
          >
            <X />
          </button>
        </div>
        <span className="nav-label">دنیای ویترین</span>
        <nav aria-label="پیمایش اصلی">
          {navigation.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={
                path === n.href || (n.href !== '/' && path.startsWith(n.href))
                  ? 'nav-item active'
                  : 'nav-item'
              }
              aria-current={path === n.href ? 'page' : undefined}
            >
              <n.icon size={20} />
              <span>{n.label}</span>
              {n.href === '/orders' && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-separator" />
        <span className="nav-label">همراه شما</span>
        <nav>
          <Link className={'nav-item ' + (page === 'support' ? 'active' : '')} href="/support">
            <Headphones size={20} />
            پشتیبانی
          </Link>
          <Link className={'nav-item ' + (page === 'settings' ? 'active' : '')} href="/settings">
            <Settings size={20} />
            تنظیمات
          </Link>
        </nav>
        <div className="owner-invite">
          <span className="invite-icon">
            <Store size={22} />
          </span>
          <h3>صاحب کافه‌اید؟</h3>
          <p>کافه‌تان را به ویترین شهر اضافه کنید.</p>
          <Link href="/dashboard">
            ثبت و مدیریت کافه
            <ArrowUpLeft size={17} />
          </Link>
        </div>
        <Link className="sidebar-profile" href={data?.user ? '/profile' : '/login'}>
          <div className="avatar small">
            {data?.user?.avatar ? (
              <img src={data.user.avatar} alt="تصویر حساب" />
            ) : (
              <UserRound size={21} />
            )}
          </div>
          <span>
            <strong>{data?.user?.name || 'به ویترین خوش آمدید'}</strong>
            <small>{data?.user ? 'حساب کاربری من' : 'ورود یا ساخت حساب'}</small>
          </span>
          <ChevronDown size={16} />
        </Link>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-start">
            <button
              className="icon-button mobile-menu"
              aria-label="باز کردن منو"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <span className="desktop-welcome">
              به وقتِ یک حال خوب <span className="tiny-dot" />
            </span>
            <Brand small />
          </div>
          <form
            className="header-search"
            onSubmit={(e) => {
              e.preventDefault();
              router.push('/cafes?q=' + encodeURIComponent(search));
            }}
          >
            <Search size={18} />
            <input
              aria-label="جستجوی کافه"
              placeholder="دنبال کدام کافه می‌گردید؟"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span>جستجو</span>
          </form>
          <div className="topbar-actions">
            <Link className="icon-button" href="/scan" aria-label="اسکن منوی کافه">
              <ScanLine size={19} />
            </Link>
            <button
              className="icon-button theme-button"
              aria-label={theme === 'light' ? 'فعال‌سازی حالت تیره' : 'فعال‌سازی حالت روشن'}
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            >
              {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <Link className="icon-button" aria-label="اعلان‌ها" href="/notifications">
              <Bell size={20} />
              {unread > 0 && <i className="notification-dot" />}
            </Link>
            <Link className="icon-button cart-link" aria-label="سبد خرید" href="/cart">
              <ShoppingBag size={20} />
              {cart.length > 0 && (
                <span className="count">{digits(cart.reduce((s, i) => s + i.quantity, 0))}</span>
              )}
            </Link>
            <Link className="header-user" href={data?.user ? '/profile' : '/login'}>
              {data?.user ? (
                <UserRound size={20} />
              ) : (
                <>
                  <LogIn size={18} />
                  <span>ورود / ثبت‌نام</span>
                </>
              )}
            </Link>
          </div>
        </header>
        <main id="main-content" className={'main-content page-' + page}>
          {error ? (
            <ErrorBox message={error} retry={() => void refresh()} />
          ) : loading ? (
            <div className="initial-skeleton">
              <div />
              <div />
              <div />
            </div>
          ) : (
            view
          )}
        </main>
        <footer className="footer">
          <span>ویترین کافه؛ جایی برای قرارهای خوب.</span>
          <div>
            <Link href="/about">درباره ما</Link>
            <Link href="/contact">تماس با ما</Link>
            <Link href="/privacy">حریم خصوصی</Link>
          </div>
        </footer>
      </div>
      <nav className="bottom-nav" aria-label="پیمایش موبایل">
        {[
          { href: '/', icon: Home, label: 'خانه' },
          { href: '/cafes', icon: Store, label: 'کافه‌ها' },
          { href: '/orders', icon: ReceiptText, label: 'سفارش‌ها' },
          { href: '/profile', icon: UserRound, label: 'حساب من' },
        ].map((n) => (
          <Link key={n.href} href={n.href} className={path === n.href ? 'active' : ''}>
            <n.icon size={22} />
            <span>{n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
