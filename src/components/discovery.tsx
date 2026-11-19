'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowUpLeft,
  Search,
  MapPin,
  SlidersHorizontal,
  Coffee,
  CreditCard,
  ReceiptText,
  Percent,
  ShoppingBag,
  CalendarDays,
  Camera,
  MessageCircleMore,
  Heart,
  Star,
  Wifi,
  Music2,
  Leaf,
  ChevronLeft,
  Store,
  Clock3,
  Phone,
  Navigation,
  LayoutGrid,
  Map,
  Plus,
  Check,
  ScanLine,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import { api, useApp, useLiveResource, useResource } from '@/lib/client';
import { reservationDemoNotice } from '@/lib/reservation-demo';
import { TableServicePanel } from './table-service';
import { CafeMeetings } from './meetings';
import { VitrinCafeHero } from './vitrin-cafe-hero';
import { VitrinListingFilters, VitrinListingPages } from './vitrin-listing';
import { VitrinMarketingHeading } from './public-content';
import type { CafeFeatures } from '@/lib/cafe-features';
import type { MenuCategory, WorkingHour } from '@/lib/cafe-operations';
import { onlinePaymentForCafe } from './payment-status';
import { CafeExplorer } from './cafe-explorer';
import { CafeCard, ProductCard, FavoriteButton } from './browse-cards';
import { ReservationMenu } from './reservation-menu';
export { MenuCategories } from './menu-categories';
import { money, digits, dateLabel, amenities, today } from '@/lib/format';
import { MENU_CATEGORIES, menuCategories, productCategory } from '@/lib/catalog';
import { eventPhase, eventPhaseLabels } from '@/lib/event-time';
import type { Cafe, Product, Review, CafeEvent, Order } from '@/lib/types';
import {
  PageTitle,
  SectionTitle,
  Empty,
  Loading,
  ErrorBox,
  Media,
  Quantity,
  Modal,
  Field,
  Submit,
  LoginGate,
  Confirm,
  LoyaltyCard,
  Badge,
} from './ui';

export function CartDock() {
  const { data, cart } = useApp();
  if (!cart.length) return null;
  return (
    <aside className="menu-cart-dock selection-cart-dock" aria-label="خلاصه انتخاب‌های سفارش">
      <div className="selection-cart-heading">
        <span className="dock-count">
          {digits(cart.reduce((sum, item) => sum + item.quantity, 0))}
        </span>
        <span>{data?.cafes.find((c) => c.id === cart[0].cafe_id)?.name || 'انتخاب‌های شما'}</span>
        <strong>{money(cart.reduce((sum, item) => sum + item.price * item.quantity, 0))}</strong>
      </div>
      <ul className="selection-cart-lines">
        {cart.map((item) => (
          <li key={item.key}>
            <span>
              {digits(item.quantity)} × {item.name}
              {item.option_names.length > 0 && <small>{item.option_names.join('، ')}</small>}
              {item.note && <small>{item.note}</small>}
            </span>
            <span>{money(item.price * item.quantity)}</span>
          </li>
        ))}
      </ul>
      <Link
        href={'/cart?cafe=' + encodeURIComponent(cart[0].cafe_id)}
        className="selection-cart-checkout"
      >
        مشاهده سبد و پرداخت <ArrowLeft size={18} />
      </Link>
    </aside>
  );
}

export function HomeView() {
  const { data } = useApp();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const home = useResource<{ products: Product[]; cafes: Cafe[] }>('home');
  const feedStatus = home.error ? (
    <ErrorBox message={home.error} retry={home.reload} />
  ) : home.loading ? (
    <Loading />
  ) : null;
  const cafes = home.data?.cafes ?? [];
  const products = home.data?.products ?? [];
  return (
    <div className="vitco-home">
      <header className="home-greeting">
        <div>
          <span className="eyebrow">به وقتِ یک حال خوب</span>
          <h1>{data?.user ? `سلام، ${data.user.name.split(' ')[0]}` : 'به ویتکو خوش آمدی'}</h1>
          <p>امروز، کجا قرار بگذاریم؟</p>
        </div>
        <Link href="/cafes" className="home-location">
          <MapPin size={16} aria-hidden="true" /> کافه‌های اطراف من
          <ChevronLeft size={14} aria-hidden="true" />
        </Link>
      </header>
      <div className="home-start-grid">
        {data?.user ? (
          <LoyaltyCard points={data.user.points} />
        ) : (
          <section className="home-welcome-card">
            <span className="welcome-caption">
              <Coffee size={18} /> به جمعِ قرارهای خوب بپیوند
            </span>
            <h2>
              یک فنجان قهوه،
              <br />
              هزار بهانه برای دیدار.
            </h2>
            <Link href="/login" className="welcome-link">
              ورود یا ساخت حساب <ArrowLeft size={17} />
            </Link>
          </section>
        )}
        <div className="home-start-actions">
          <form
            className="home-search"
            onSubmit={(e) => {
              e.preventDefault();
              router.push('/cafes?q=' + encodeURIComponent(search.trim()));
            }}
          >
            <Search size={20} aria-hidden="true" />
            <input
              aria-label="نام کافه یا محله"
              placeholder="کافه یا محله‌ات را پیدا کن…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" aria-label="پیدا کن">
              <ArrowLeft size={20} />
            </button>
          </form>
          <section className="home-payment-guide" aria-label="راهنمای پرداخت حضوری">
            <div>
              <h2>پرداخت حضوری با ویتکو</h2>
              <p>آخر غذا، موقع حساب کردن</p>
            </div>
            <nav className="home-services" aria-label="مراحل پرداخت حضوری">
              <Link href="/cafes">
                <span>
                  <ReceiptText size={25} />
                </span>
                <strong>فاکتور بگیر</strong>
                <small>از صندوق‌دار</small>
              </Link>
              <Link href="/cafes">
                <span>
                  <CreditCard size={25} />
                </span>
                <strong>مبلغ رو بزن</strong>
                <small>توی صفحه کافه</small>
              </Link>
              <Link href="/cafes">
                <span>
                  <Percent size={25} />
                </span>
                <strong>تخفیف بگیر</strong>
                <small>با پرداخت ویتکو</small>
              </Link>
            </nav>
          </section>
        </div>
      </div>
      {data?.user && <MemberHome />}
      <section className="home-menu-section">
        <SectionTitle
          title="بیشترین سفارش‌ها در ویتکو"
          description="بر اساس تعداد هر آیتم در سفارش‌های تکمیل‌شده"
          href="/menu"
          label="همه منوها"
        />
        <nav className="home-discovery-tags" aria-label="دسته‌بندی منوی کافه‌ها">
          {MENU_CATEGORIES.map((category) => (
            <Link key={category} href={'/menu?category=' + encodeURIComponent(category)}>
              {category}
            </Link>
          ))}
        </nav>
        {feedStatus ??
          (products.length ? (
            <div className="product-grid">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <Empty
              title="هنوز آیتمی برای نمایش در این رتبه‌بندی نیست"
              href="/menu"
              label="دیدن منوها"
            />
          ))}
      </section>
      <section className="home-cafes-section">
        <SectionTitle
          title="برترین کافه‌های ویتکو"
          description="معرفی کافه‌ها با حمایت مالی"
          href="/cafes"
          label="همه کافه‌ها"
        />
        <nav className="home-discovery-tags" aria-label="انتخاب فضای کافه">
          {[
            { label: 'مناسب کار', href: '/cafes?amenity=work', icon: Wifi },
            { label: 'فضای باز', href: '/cafes?amenity=outdoor', icon: Leaf },
            { label: 'موسیقی زنده', href: '/cafes?amenity=music', icon: Music2 },
            { label: 'دورهمی خانوادگی', href: '/cafes?amenity=family', icon: Users },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <item.icon size={16} />
              {item.label}
            </Link>
          ))}
        </nav>
        <nav
          className="home-discovery-tags menu-discovery-links"
          aria-label="انتخاب کافه بر اساس منو"
        >
          {MENU_CATEGORIES.map((category) => (
            <Link key={category} href={'/cafes?category=' + encodeURIComponent(category)}>
              <Coffee size={16} />
              {category}
            </Link>
          ))}
        </nav>
        {feedStatus ??
          (cafes.length ? (
            <div className="home-cafe-grid">
              {cafes.map((c) => (
                <CafeCard key={c.id} cafe={c} />
              ))}
            </div>
          ) : (
            <Empty
              title="فعلاً کافه‌ای در این بخش معرفی نشده است"
              href="/partnership"
              label="درخواست معرفی کافه"
              icon="store"
            />
          ))}
      </section>
      <Link href="/dashboard" className="home-owner-link">
        <span className="home-owner-icon">
          <Store size={23} />
        </span>
        <span>
          <strong>کافه‌ات را به ویتکو بیاور</strong>
          <small>مدیریت منو، سفارش‌ها و رزروها در یک‌جا</small>
        </span>
        <ArrowUpLeft size={20} />
      </Link>
    </div>
  );
}
function MemberHome() {
  const recent = useResource<{ orders: Order[] }>('orders');
  const last = recent.data?.orders[0];
  return (
    <section className="home-recent">
      <SectionTitle title="آخرین سفارش تو" href="/orders" label="همه سفارش‌ها" />
      {recent.loading ? (
        <Loading />
      ) : recent.error ? (
        <ErrorBox message={recent.error} retry={recent.reload} />
      ) : last ? (
        <Link className="home-order-card" href={'/orders/' + last.id}>
          <span className="home-order-icon">
            <ShoppingBag size={24} />
          </span>
          <span className="home-order-copy">
            <strong>{last.cafe_name}</strong>
            <small>
              {dateLabel(last.created_at)} ·{' '}
              {last.kind === 'invoice'
                ? 'پرداخت فاکتور حضوری'
                : last.mode === 'delivery'
                  ? 'ارسال به آدرس'
                  : last.mode === 'dine_in'
                    ? 'مصرف در کافه'
                    : 'تحویل از کافه'}
            </small>
          </span>
          <span className="home-order-meta">
            <Badge status={last.status} />
            <strong>{money(last.total)}</strong>
          </span>
          <ChevronLeft size={18} aria-hidden="true" />
        </Link>
      ) : (
        <div className="home-first-order">
          <ShoppingBag size={24} />
          <div>
            <h3>اولین طعم، اولین خاطره</h3>
            <p>پس از ثبت سفارش، از همین‌جا پیگیرش باش.</p>
          </div>
          <Link href="/menu" className="text-link">
            دیدن منو <ArrowLeft size={16} />
          </Link>
        </div>
      )}
    </section>
  );
}
export function CafesView({ favorites = false }: { favorites?: boolean }) {
  return <CafeExplorer favorites={favorites} />;
}
const cafeDetailTabs = [
  { id: 'menu', label: 'منوی کافه', icon: Coffee },
  { id: 'gallery', label: 'گالری', icon: Camera },
  { id: 'events', label: 'رویدادها و جلسات', icon: CalendarDays },
  { id: 'reviews', label: 'نظرها', icon: MessageCircleMore },
] as const;

export function CafeView({ id }: { id: string }) {
  const { data: app, toast, cart } = useApp(),
    router = useRouter(),
    query = useSearchParams();
  const { data, loading, error, reload } = useResource<{
    cafe: Cafe;
    products: Product[];
    features: CafeFeatures;
    branches: Pick<Cafe, 'id' | 'name' | 'address'>[];
    hours: WorkingHour[];
    menu_groups: MenuCategory[];
    reviews: Review[];
    own_review: Review | null;
  }>('cafes/' + id);
  const [category, setCategory] = useState(''),
    [rating, setRating] = useState(5),
    [review, setReview] = useState(''),
    [reviewEdit, setReviewEdit] = useState(false),
    [reviewDelete, setReviewDelete] = useState(false),
    [busy, setBusy] = useState(false);
  const [hash, setHash] = useState('');
  useEffect(() => {
    const update = () => setHash(window.location.hash.slice(1));
    update();
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const tab =
    cafeDetailTabs.find((item) => item.id === hash)?.id ||
    cafeDetailTabs.find((item) => item.id === query.get('tab'))?.id ||
    'menu';
  function setTab(next: (typeof cafeDetailTabs)[number]['id']) {
    const params = new URLSearchParams(query);
    params.delete('tab');
    const tag = next === 'menu' ? '' : '#' + next;
    window.history.replaceState(
      null,
      '',
      '/cafes/' + encodeURIComponent(id) + (params.size ? '?' + params : '') + tag,
    );
    setHash(next);
  }
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'کافه پیدا نشد.'} />;
  const {
    cafe,
    products,
    features,
    reviews,
    own_review: ownReview,
    branches,
    hours,
    menu_groups: menuGroups,
  } = data;
  const photos = [...new Set([cafe.image, ...(cafe.images || [])].filter(Boolean))];
  return (
    <div className={'cafe-discovery-page' + (cart.length ? ' has-cart-dock' : '')}>
      <VitrinCafeHero cafe={cafe} cover={photos[0]} vip={features.vip_cafe} />
      <div className="vitrin-cafe-body">
        <aside className="vitrin-cafe-sidebar">
          <h2>{cafe.name}</h2>
          <nav aria-label="بخش‌های صفحهٔ کافه">
            {cafeDetailTabs.map(({ id: value, label, icon: Icon }) => (
              <button
                type="button"
                key={value}
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
              >
                {label} <Icon size={20} aria-hidden="true" />
              </button>
            ))}
          </nav>
          <div className="vitrin-cafe-utilities">
            {!cafe.is_demo && (
              <Link className="cafe-invoice-entry" href={'/bill?cafe=' + id}>
                <span className="invoice-entry-icon">
                  <ReceiptText size={25} />
                </span>
                <span>
                  <strong>پرداخت صورت‌حساب حضوری</strong>
                  <small>مبلغ فاکتور را وارد کن، تخفیف‌ها را ببین و پرداخت کن</small>
                </span>
                <ArrowLeft size={20} />
              </Link>
            )}

            {cafe.amenities.length > 0 && (
              <div className="amenity-tags" aria-label="امکانات کافه">
                {cafe.amenities.map((name) => (
                  <span key={name}>{amenities[name] || name}</span>
                ))}
              </div>
            )}
            {cafe.owner_id && (
              <p>
                <Clock3 size={18} />
                {digits(cafe.opens)} تا {digits(cafe.closes)}
              </p>
            )}
            {hours.length > 0 && (
              <details>
                <summary>ساعت کاری هفته</summary>
                <dl className="service-hours">
                  {hours.map((hour) => (
                    <div key={hour.weekday}>
                      <dt>
                        {
                          ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'][
                            hour.weekday
                          ]
                        }
                      </dt>
                      <dd>
                        {hour.opens ? digits(hour.opens) + ' تا ' + digits(hour.closes) : 'تعطیل'}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
            {branches.length > 1 && (
              <div className="service-inline" aria-label="شعبه‌های کافه">
                {branches.map((branch) => (
                  <Link
                    className={branch.id === id ? 'badge' : 'text-link'}
                    aria-current={branch.id === id ? 'page' : undefined}
                    href={'/cafes/' + branch.id}
                    key={branch.id}
                  >
                    {branch.name}
                  </Link>
                ))}
              </div>
            )}
            {cafe.owner_id ? (
              <div className="button-row">
                {cafe.active && (
                  <Link
                    href={'/reserve?cafe=' + id}
                    className="button primary"
                    aria-label="رزرو و سفارش"
                  >
                    <CalendarDays size={18} />
                    رزرو میز
                  </Link>
                )}
                {!cafe.active && <p className="notice">رزرو این کافه در حال حاضر غیرفعال است.</p>}
                {cafe.phone && (
                  <a className="button secondary" href={'tel:' + cafe.phone}>
                    <Phone size={18} />
                    تماس
                  </a>
                )}
              </div>
            ) : (
              <div className="source-note">
                اطلاعات این کافه از{' '}
                <a href={cafe.source} target="_blank" rel="noreferrer">
                  {cafe.directory_source === 'hmghadam'
                    ? 'این‌ورا، از طریق داده‌های همقدم'
                    : 'ویترین کافه'}
                </a>{' '}
                دریافت شده است. رزرو و سفارش آنلاین این کافه در این سامانه فعال نیست.
              </div>
            )}
            {cafe.external_menu_url && (
              <a
                className="text-link"
                href={cafe.external_menu_url}
                target="_blank"
                rel="noreferrer"
              >
                مشاهده منو در منبع اصلی
              </a>
            )}
            {cafe.latitude !== null && cafe.longitude !== null && (
              <a
                href={`https://www.openstreetmap.org/?mlat=${cafe.latitude}&mlon=${cafe.longitude}#map=17/${cafe.latitude}/${cafe.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="text-link"
              >
                <Navigation size={16} />
                مسیریابی
              </a>
            )}
          </div>
        </aside>
        <div className="vitrin-cafe-tab">
          {cafe.is_demo && (
            <p className="notice" role="note">
              {reservationDemoNotice}
            </p>
          )}
          {tab === 'menu' && (
            <>
              <TableServicePanel cafeId={id} />
              {menuGroups.some((group) => group.image) && (
                <div className="service-category-gallery" aria-label="تصاویر دسته‌های منو">
                  {menuGroups
                    .filter((group) => group.image)
                    .map((group) => (
                      <button
                        type="button"
                        key={group.id}
                        aria-pressed={category === group.name}
                        onClick={() => setCategory(group.name)}
                      >
                        <Media src={group.image} alt="" />
                        <span>{group.name}</span>
                      </button>
                    ))}
                </div>
              )}
              <ReservationMenu
                cafeId={id}
                variant="catalog"
                products={products}
                categoryOrder={menuGroups.map((group) => group.name)}
                category={category}
                onCategoryChange={setCategory}
              />
            </>
          )}
          {tab === 'gallery' && (
            <section className="panel stack" aria-label="گالری کافه">
              {cafe.tour_url && (
                <a
                  className="button secondary"
                  href={cafe.tour_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  باز کردن تور مجازی
                </a>
              )}
              {photos.length ? (
                <div className="service-gallery">
                  {photos.map((photo, index) => (
                    <a key={photo} href={photo} target="_blank" rel="noreferrer">
                      <Media src={photo} alt={cafe.name + '، عکس ' + digits(index + 1)} />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="muted">هنوز عکسی برای این کافه ثبت نشده است.</p>
              )}
            </section>
          )}
          {tab === 'reviews' && (
            <div className="two-columns">
              <div>
                {reviews.length ? (
                  reviews.map((r) => (
                    <article className="review panel" key={r.id}>
                      <div className="card-heading">
                        <strong>{r.name}</strong>
                        <span className="rating">
                          <Star size={16} />
                          {digits(r.rating)}
                        </span>
                      </div>
                      <p>{r.body}</p>
                      {r.verified && <p className="muted">تجربه تأییدشده</p>}
                      <small>{dateLabel(r.created_at)}</small>
                    </article>
                  ))
                ) : (
                  <Empty
                    title="اولین تجربه را شما بنویسید"
                    description="هنوز نظری برای این کافه ثبت نشده است."
                  />
                )}
              </div>
              {ownReview && !reviewEdit ? (
                <section className="panel">
                  <h3>نظر شما</h3>
                  <p>{ownReview.body}</p>
                  {ownReview.visible === 0 && (
                    <p className="muted">این نظر از دید عموم پنهان شده است.</p>
                  )}
                  <div className="button-row">
                    <button
                      className="button secondary"
                      onClick={() => {
                        setReview(ownReview.body);
                        setRating(ownReview.rating);
                        setReviewEdit(true);
                      }}
                    >
                      ویرایش نظر
                    </button>
                    <button className="text-link" onClick={() => setReviewDelete(true)}>
                      حذف نظر
                    </button>
                  </div>
                </section>
              ) : (
                <form
                  className="panel form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!app?.user) {
                      router.push('/login');
                      return;
                    }
                    setBusy(true);
                    try {
                      await api('reviews/' + id, ownReview ? 'PATCH' : 'POST', {
                        rating,
                        body: review,
                      });
                      setReview('');
                      setReviewEdit(false);
                      reload();
                      toast('نظر شما ثبت شد.');
                    } catch (e) {
                      toast((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <h3>تجربه شما از این کافه</h3>
                  <div className="stars">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-label={digits(s) + ' ستاره'}
                        onClick={() => setRating(s)}
                      >
                        <Star fill={s <= rating ? 'currentColor' : 'none'} />
                      </button>
                    ))}
                  </div>
                  <Field label="نظر شما">
                    <textarea
                      value={review}
                      onChange={(e) => setReview(e.target.value)}
                      maxLength={1500}
                      placeholder="از فضا، کیفیت و تجربه‌ات بگو…"
                    />
                  </Field>
                  <Submit busy={busy}>{ownReview ? 'ذخیره نظر' : 'ثبت نظر'}</Submit>
                  {ownReview && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setReviewEdit(false)}
                    >
                      انصراف
                    </button>
                  )}
                </form>
              )}
              <Confirm
                open={reviewDelete}
                title="حذف نظر"
                description="نظر شما از صفحه این کافه حذف می‌شود."
                onClose={() => setReviewDelete(false)}
                onConfirm={() => {
                  setReviewDelete(false);
                  void api('reviews/' + id, 'DELETE')
                    .then(() => {
                      setRating(5);
                      setReview('');
                      reload();
                      toast('نظر حذف شد.');
                    })
                    .catch((e) => toast(e.message));
                }}
              />
            </div>
          )}
          {tab === 'events' && (
            <>
              <EventList events={app?.events.filter((e) => e.cafe_id === id) || []} />
              {cafe.owner_id && !cafe.is_demo && <CafeMeetings cafeId={id} />}
            </>
          )}
        </div>
      </div>
      <CartDock />
    </div>
  );
}
export function MenuView() {
  const { data, cart } = useApp();
  const query = useSearchParams();
  const cafeId = query.get('cafe');
  const cafe = data?.cafes.find((item) => item.id === cafeId);
  if (!cafeId) return <CafeExplorer listOnly />;
  if (!cafe)
    return (
      <Empty title="کافه پیدا نشد" description="کافه دیگری را از فهرست انتخاب کن." href="/menu" />
    );
  return (
    <div className={'vitco-menu cafe-menu-page' + (cart.length ? ' has-cart-dock' : '')}>
      <PageTitle
        title={cafe.name}
        description="منوی کافه"
        back="/menu"
        action={
          <Link href={'/bill?cafe=' + cafe.id} className="button primary">
            <CreditCard size={18} />
            پرداخت حضوری
          </Link>
        }
      />
      <ReservationMenu
        cafeId={cafe.id}
        variant="catalog"
        initialCategory={productCategory(query.get('category') || '')}
      />
      <CartDock />
    </div>
  );
}
export function ProductView({ id }: { id: string }) {
  const { data, cart, addCart, setCart, toast } = useApp();
  const publicProduct = data?.products.find((p) => p.id === id);
  const menuItem = useResource<{ product: Product }>(publicProduct ? null : 'products/' + id);
  const p = publicProduct || menuItem.data?.product,
    cafe = data?.cafes.find((c) => c.id === p?.cafe_id);
  const [size, setSize] = useState(p?.sizes[0]?.id || ''),
    [addons, setAddons] = useState<string[]>([]),
    [quantity, setQuantity] = useState(1),
    [note, setNote] = useState(''),
    [photo, setPhoto] = useState(''),
    [replace, setReplace] = useState(false),
    [added, setAdded] = useState(false);
  if (!publicProduct && menuItem.loading) return <Loading />;
  if (!p || !cafe)
    return (
      <Empty
        title="این محصول پیدا نشد"
        description="برای دیدن محصولات موجود به منوی کافه‌ها برگرد."
        href="/menu"
        label="مشاهده منو"
      />
    );
  const selectedSize = p.sizes.find((s) => s.id === size) || p.sizes[0],
    price =
      p.price +
      (selectedSize?.price || 0) +
      p.addons.filter((a) => addons.includes(a.id)).reduce((s, a) => s + a.price, 0);
  const photos = [...new Set([p.image, ...(p.images || [])].filter(Boolean))];
  const selectedPhoto = photos.includes(photo) ? photo : photos[0] || '';
  const line = {
    key: crypto.randomUUID(),
    product_id: p.id,
    cafe_id: p.cafe_id,
    name: p.name,
    image: p.image,
    price,
    size_id: selectedSize?.id || '',
    addon_ids: addons,
    option_names: [
      ...(selectedSize ? [selectedSize.name] : []),
      ...p.addons.filter((a) => addons.includes(a.id)).map((a) => a.name),
    ],
    quantity,
    note,
  };
  function add() {
    if (addCart(line)) setAdded(true);
    else if (cart[0]?.cafe_id !== p?.cafe_id) setReplace(true);
  }
  return (
    <div className="vitco-product">
      <PageTitle
        title="جزئیات محصول"
        back={'/cafes/' + cafe.id}
        action={
          <Link className="button secondary" href="/cart" aria-label="سبد خرید">
            <ShoppingBag size={18} />
            <span>سبد خرید</span>
          </Link>
        }
      />
      <div className="product-detail">
        <div>
          <Media className="product-large" src={selectedPhoto} alt={p.name} />
          {photos.length > 1 && (
            <div className="service-category-gallery" aria-label="عکس‌های محصول">
              {photos.map((src, index) => (
                <button
                  key={src}
                  type="button"
                  aria-label={'عکس ' + digits(index + 1)}
                  aria-pressed={selectedPhoto === src}
                  onClick={() => setPhoto(src)}
                >
                  <Media src={src} alt="" />
                </button>
              ))}
            </div>
          )}
          <p className="source-note">
            {p.source
              ? 'نام، توضیحات و قیمت از منوی منتشرشده ویترین کافه دریافت شده‌اند.'
              : 'قیمت و مشخصات توسط کافه ثبت شده‌اند.'}
          </p>
        </div>
        <div className="product-config">
          <Link href={'/cafes/' + cafe.id} className="eyebrow">
            {cafe.name}
            <ChevronLeft size={14} />
          </Link>
          <h2 className="product-name">{p.name}</h2>
          <p>{p.description}</p>
          <strong className="product-price">{money(p.price)}</strong>
          {p.sizes.length > 0 && (
            <fieldset className="option-group">
              <legend>
                اندازه <small>انتخاب یک گزینه</small>
              </legend>
              {p.sizes.map((s) => (
                <label className="option-row" key={s.id}>
                  <span>
                    <input
                      type="radio"
                      name="size"
                      value={s.id}
                      checked={selectedSize?.id === s.id}
                      onChange={() => setSize(s.id)}
                    />
                    {s.name}
                  </span>
                  <strong>{s.price ? '+ ' + money(s.price) : 'بدون هزینه اضافه'}</strong>
                </label>
              ))}
            </fieldset>
          )}
          {p.addons.length > 0 && (
            <fieldset className="option-group">
              <legend>
                افزودنی‌ها <small>حداکثر {digits(p.max_addons)} انتخاب</small>
              </legend>
              {p.addons.map((a) => (
                <label className="option-row" key={a.id}>
                  <span>
                    <input
                      type="checkbox"
                      checked={addons.includes(a.id)}
                      disabled={!addons.includes(a.id) && addons.length >= p.max_addons}
                      onChange={(e) =>
                        setAddons(
                          e.target.checked ? [...addons, a.id] : addons.filter((id) => id !== a.id),
                        )
                      }
                    />
                    {a.name}
                  </span>
                  <strong>+ {money(a.price)}</strong>
                </label>
              ))}
            </fieldset>
          )}
          <Field label="توضیحات سفارش" hint={digits(note.length) + ' / ۳۰۰'}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder="اگر نکته‌ای هست، به کافه بگو…"
            />
          </Field>
          <div
            className={
              'product-purchase-bar' + (cafe.owner_id && cafe.active ? ' is-orderable' : '')
            }
          >
            <div className="product-total">
              <Quantity value={quantity} onChange={setQuantity} />
              <span className="product-total-price">
                <small>مجموع انتخاب شما</small>
                <strong aria-live="polite">{money(price * quantity)}</strong>
              </span>
            </div>
            {!cafe.owner_id || !cafe.active ? (
              <div className="notice">
                <Coffee size={20} />
                <span>این منو برای مشاهده است. سفارش آنلاین کافه هنوز فعال نیست.</span>
              </div>
            ) : (
              <button className="button primary full" disabled={!p.available} onClick={add}>
                {p.available ? (
                  <>
                    <Plus size={20} />
                    افزودن به سبد خرید
                  </>
                ) : (
                  'این محصول موجود نیست'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
      <Modal
        open={added}
        onClose={() => setAdded(false)}
        title="به سبد خرید اضافه شد"
        presentation="sheet"
      >
        <div className="added-summary">
          <span className="added-check">
            <Check size={26} />
          </span>
          <h3>{p.name}</h3>
          <p>
            {digits(quantity)} عدد · {money(price * quantity)}
          </p>
          <small>{line.option_names.join('، ')}</small>
        </div>
        <div className="stack">
          <Link href="/cart" className="button primary full" onClick={() => setAdded(false)}>
            مشاهده سبد خرید <ShoppingBag size={18} />
          </Link>
          <button className="button secondary full" onClick={() => setAdded(false)}>
            ادامه انتخاب
          </button>
        </div>
      </Modal>
      <Confirm
        open={replace}
        title="شروع یک سبد تازه؟"
        description="سبد فعلی از کافه دیگری است. با ادامه، آن سبد حذف و این محصول جایگزین می‌شود."
        onClose={() => setReplace(false)}
        onConfirm={() => {
          setCart([line]);
          setReplace(false);
          setAdded(true);
          toast('سبد خرید جدید آماده است.');
        }}
      />
    </div>
  );
}
function useEventNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function EventList({ events }: { events: CafeEvent[] }) {
  const [filter, setFilter] = useState('all');
  const now = useEventNow();
  const filtered = events.filter((event) => filter === 'all' || eventPhase(event, now) === filter);
  return (
    <section className="event-discovery">
      <div className="tabs event-filters" role="group" aria-label="زمان برگزاری رویدادها">
        {[
          { id: 'all', label: 'تمام رویدادها' },
          { id: 'upcoming', label: 'رویدادهای آینده' },
          { id: 'ongoing', label: 'در حال برگزاری' },
        ].map((item) => (
          <button
            key={item.id}
            aria-pressed={filter === item.id}
            className={filter === item.id ? 'active' : ''}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
            <span>
              {digits(
                events.filter((event) => item.id === 'all' || eventPhase(event, now) === item.id)
                  .length,
              )}
            </span>
          </button>
        ))}
      </div>
      {filtered.length ? (
        <div className="cafe-grid">
          {filtered.map((event) => (
            <VitrinEventCard key={event.id} event={event} now={now} />
          ))}
        </div>
      ) : (
        <Empty
          title={filter === 'all' ? 'قرارهای تازه در راه‌اند' : 'رویدادی در این بازه وجود ندارد'}
          description={
            filter === 'all'
              ? 'هنوز رویدادی ثبت نشده است. کافه‌ها پس از انتشار رویداد، همین‌جا میزبان شما خواهند بود.'
              : 'برای دیدن برنامه‌های کافه، تمام رویدادها را انتخاب کن.'
          }
          href={filter === 'all' ? '/cafes' : undefined}
        />
      )}
    </section>
  );
}
function VitrinEventCard({
  event,
  now,
  featured = false,
}: {
  event: CafeEvent;
  now: number;
  featured?: boolean;
}) {
  const phase = eventPhase(event, now);
  const { data } = useApp();
  const cover = event.image || data?.cafes.find((cafe) => cafe.id === event.cafe_id)?.image;
  return (
    <article
      className={'event-card panel vitrin-event-card' + (featured ? ' vitrin-event-featured' : '')}
    >
      <Media src={cover} alt={event.title} />
      <div className="vitrin-event-card-body">
        <div className="service-inline">
          <span className="eyebrow">{event.cafe_name}</span>
          <span className={'badge event-phase event-phase-' + phase}>
            {eventPhaseLabels[phase]}
          </span>
        </div>
        <h3>{event.title}</h3>
        <p>
          <CalendarDays size={16} /> {dateLabel(event.date)} · {digits(event.time)}
          {event.end_time ? ' تا ' + digits(event.end_time) : ''}
        </p>
        <p>
          {event.price ? money(event.price) : 'رایگان'} ·{' '}
          {digits(Math.max(0, event.capacity - event.registered))} ظرفیت باقی‌مانده
        </p>
        <Link className="button secondary" href={'/events/' + event.id}>
          جزئیات رویداد <ArrowLeft size={16} />
        </Link>
      </div>
    </article>
  );
}

function VitrinEventsIndex() {
  const query = useSearchParams();
  const now = useEventNow();
  const resource = useLiveResource<{ events: CafeEvent[]; page: number; pages: number }>(
    'events' + (query.size ? '?' + query : ''),
    20000,
  );
  const events = resource.data?.events || [];
  const featured = !query.size ? events[0] : undefined;
  const filtered = featured ? events.slice(1) : events;
  return (
    <div className="vitrin-listing">
      <PageTitle
        title="رویدادها"
        description="رویدادها و برنامه‌های میزبانی‌شده توسط کافه‌ها را کشف کنید، زمان و ظرفیت را ببینید و ثبت‌نام کنید."
      />
      <VitrinListingFilters kind="events">
        <input
          aria-label="شهر"
          name="city"
          placeholder="شهر"
          maxLength={80}
          defaultValue={query.get('city') || ''}
        />
        <select aria-label="نوع رویداد" name="is_free" defaultValue={query.get('is_free') || ''}>
          <option value="">همه</option>
          <option value="true">رایگان</option>
          <option value="false">پولی</option>
        </select>
        <select aria-label="مرتب‌سازی" name="sort" defaultValue={query.get('sort') || 'starts_at'}>
          <option value="starts_at">نزدیک‌ترین</option>
          <option value="newest">جدیدترین</option>
        </select>
      </VitrinListingFilters>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorBox message={resource.error} retry={resource.reload} />
      ) : !events.length ? (
        <Empty
          title={query.size ? 'رویدادی با این مشخصات پیدا نشد' : 'رویدادی برای نمایش وجود ندارد'}
          href={query.size ? '/events' : '/cafes'}
          label={query.size ? 'پاک کردن فیلترها' : 'مشاهده کافه‌ها'}
        />
      ) : (
        <>
          {featured && <VitrinEventCard event={featured} now={now} featured />}
          {filtered.length > 0 && (
            <div className="vitrin-list-cards">
              {filtered.map((event) => (
                <VitrinEventCard event={event} now={now} key={event.id} />
              ))}
            </div>
          )}
          {resource.data && (
            <VitrinListingPages page={resource.data.page} pages={resource.data.pages} />
          )}
        </>
      )}
    </div>
  );
}

export function EventsView({ id }: { id?: string }) {
  const { data, refresh, toast } = useApp(),
    router = useRouter();
  const [busy, setBusy] = useState(false);
  const now = useEventNow();
  const detail = useLiveResource<{ event: CafeEvent }>(id ? 'events/' + id : null, 15000);
  const event =
    detail.data?.event ?? (detail.loading ? data?.events.find((e) => e.id === id) : undefined);
  if (!id) return <VitrinEventsIndex />;
  if (detail.loading && !event) return <Loading />;
  if (!event)
    return (
      <Empty
        title="رویداد پیدا نشد"
        description="فهرست رویدادهای کافه‌ها را ببین."
        href="/events"
        label="همه رویدادها"
      />
    );
  const paying = event.registration_status === 'pending_payment' && event.registration_order_id;
  const gateway = onlinePaymentForCafe(data?.onlinePayment, event.cafe_id);
  const phase = eventPhase(event, now);
  const accepting = event.status !== 'completed' && (phase === 'upcoming' || phase === 'ongoing');
  const leaving = event.registration_status === 'registered' || Boolean(paying);
  return (
    <>
      <PageTitle title={event.title} back="/events" description={event.cafe_name} />
      <div className="two-columns vitrin-event-detail">
        <Media src={event.image} alt={event.title} className="event-cover" />
        <div className="panel form">
          <h2>{event.title}</h2>
          <span className={'badge event-phase event-phase-' + phase}>
            {eventPhaseLabels[phase]}
          </span>
          <p>{event.description}</p>
          <div className="list-row">
            <span>تاریخ</span>
            <strong>{dateLabel(event.date)}</strong>
          </div>
          <div className="list-row">
            <span>ساعت</span>
            <strong>
              {digits(event.time)}
              {event.end_time ? ' تا ' + digits(event.end_time) : ''}
            </strong>
          </div>
          <div className="list-row">
            <span>ظرفیت باقی‌مانده</span>
            <strong>{digits(Math.max(0, event.capacity - event.registered))} نفر</strong>
          </div>
          <div className="list-row">
            <span>بلیت</span>
            <strong>{event.price ? money(event.price) : 'رایگان'}</strong>
          </div>
          {paying && (
            <Link className="button primary" href={'/orders/' + event.registration_order_id}>
              ادامه پرداخت بلیت
            </Link>
          )}
          {Boolean(event.price) && !gateway && !event.joined && !paying && (
            <p className="notice">پرداخت آنلاین این رویداد در دسترس نیست.</p>
          )}
          {event.registration_status === 'attended' || (!accepting && event.joined) ? (
            <Link className="button secondary" href="/registrations">
              مشاهده ثبت‌نام
            </Link>
          ) : (
            <button
              className={paying ? 'button secondary' : 'button primary'}
              disabled={
                busy ||
                !accepting ||
                (!leaving &&
                  (event.registered >= event.capacity || Boolean(event.price && !gateway)))
              }
              onClick={async () => {
                if (!data?.user) {
                  router.push('/login?next=' + encodeURIComponent('/events/' + id));
                  return;
                }
                setBusy(true);
                try {
                  const response = await api<{ order_id: string | null }>(
                    'events/' + id + (leaving ? '/leave' : ''),
                    'POST',
                    {},
                  );
                  detail.reload();
                  await refresh();
                  if (response.order_id) router.push('/orders/' + response.order_id);
                  else toast(leaving ? 'ثبت‌نام لغو شد.' : 'ثبت‌نام شما انجام شد.');
                } catch (e) {
                  toast((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {leaving ? 'لغو ثبت‌نام' : event.price ? 'دریافت و پرداخت بلیت' : 'شرکت در رویداد'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
export function InfoView({ page }: { page: string }) {
  const content: Record<string, { title: string; intro: string; paragraphs: string[] }> = {
    privacy: {
      title: 'حریم خصوصی شما',
      intro: 'اعتماد شما برای ما مهم است.',
      paragraphs: [
        'اطلاعات حساب، نشانی‌ها، سفارش‌ها و رزروهای شما در پایگاه داده این سامانه نگهداری می‌شود. رمز عبور به صورت رمزنگاری یک‌طرفه ذخیره می‌شود.',
        'کافه فقط اطلاعات سفارش‌ها و رزروهای مربوط به خودش را می‌بیند. موقعیت مکانی تنها با اجازه شما دریافت و در صورت ذخیره آدرس یا کافه ثبت می‌شود.',
        'سبد خرید و انتخاب ظاهر برنامه در مرورگر شما ذخیره می‌شوند. کد ورود یا بازیابی فقط در صورت فعال بودن سرویس پیامک یا ایمیل برای شما ارسال می‌شود.',
        'برای درخواست بررسی یا حذف اطلاعات، از بخش پشتیبانی پیام بفرستید.',
      ],
    },
    terms: {
      title: 'شرایط استفاده',
      intro: 'برای یک تجربه روشن و خوشایند',
      paragraphs: [
        'قیمت‌ها به تومان هستند و هنگام ثبت سفارش از اطلاعات فعلی کافه محاسبه می‌شوند. ثبت درخواست سفارش یا رزرو به معنی تأیید فوری کافه نیست.',
        'پرداخت سفارش می‌تواند هنگام تحویل، در کافه یا از طریق درگاه فعال کافه انجام شود. اطلاعات کارت بانکی در ویتکو ثبت نمی‌شود.',
        'سفارش تا پیش از شروع آماده‌سازی قابل لغو است. رزروهای در انتظار تأیید یا تأییدشده از حساب شما قابل لغو هستند.',
        'صاحب کافه مسئول درستی اطلاعات، قیمت‌ها، ظرفیت و اجرای سفارش‌ها و رزروهاست. نظرات باید بر تجربه واقعی مبتنی باشند.',
      ],
    },
  };
  const item = content[page] || content.terms;
  if (page === 'terms') {
    const headings = [
      'قیمت‌ها و ثبت سفارش',
      'پرداخت و اطلاعات بانکی',
      'لغو سفارش و رزرو',
      'مسئولیت کافه و کاربران',
    ];
    return (
      <div className="vitrin-marketing">
        <VitrinMarketingHeading
          title="شرایط و"
          highlight="قوانین"
          description="شرایط استفاده از ویترین کافه برای کاربران و کافه‌های همکار."
        />
        <div className="vitrin-terms-grid">
          <nav aria-label="فهرست شرایط و قوانین">
            <h2>فهرست مطالب</h2>
            {headings.map((heading, index) => (
              <a href={'#terms-' + index} key={heading}>
                {heading}
              </a>
            ))}
          </nav>
          <div className="stack">
            {item.paragraphs.map((body, index) => (
              <section className="vitrin-marketing-feature" key={body} id={'terms-' + index}>
                <h2>{headings[index]}</h2>
                <p>{body}</p>
              </section>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <>
      <PageTitle title={item.title} description={item.intro} />
      <article className="panel prose">
        {item.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <Link href="/cafes" className="button primary">
          ورود به دنیای کافه‌ها
          <ArrowLeft size={17} />
        </Link>
      </article>
    </>
  );
}
export function ScannerView() {
  const router = useRouter(),
    video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    scanningRequest = useRef(0),
    resolutionRequest = useRef(0);
  const [value, setValue] = useState(''),
    [error, setError] = useState(''),
    [scanning, setScanning] = useState(false),
    [resolving, setResolving] = useState(false);
  useEffect(
    () => () => {
      scanningRequest.current++;
      resolutionRequest.current++;
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  async function navigate(raw: string) {
    setError('');
    setResolving(true);
    const attempt = ++resolutionRequest.current;
    try {
      const result = await api<{ href: string }>('scanner/resolve', 'POST', { url: raw });
      if (attempt === resolutionRequest.current) router.push(result.href);
    } catch (err) {
      if (attempt === resolutionRequest.current) setError((err as Error).message);
    } finally {
      if (attempt === resolutionRequest.current) setResolving(false);
    }
  }
  async function scan() {
    setError('');
    const attempt = ++scanningRequest.current;
    setScanning(true);
    try {
      const { default: decode } = await import('jsqr');
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      const element = video.current;
      if (!element || attempt !== scanningRequest.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      element.srcObject = media;
      await element.play();
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error();
      function tick() {
        if (attempt !== scanningRequest.current || !media.active || !element) return;
        if (element.videoWidth && element.videoHeight && context) {
          const scale = Math.min(1, 700 / Math.max(element.videoWidth, element.videoHeight));
          canvas.width = Math.max(1, Math.round(element.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(element.videoHeight * scale));
          context.drawImage(element, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = decode(pixels.data, pixels.width, pixels.height, {
            inversionAttempts: 'dontInvert',
          });
          if (code) {
            stop();
            void navigate(code.data);
            return;
          }
        }
        window.setTimeout(tick, 160);
      }
      tick();
    } catch {
      if (attempt === scanningRequest.current) {
        stop();
        setError('دوربین در دسترس نیست. اجازه دوربین را بررسی یا پیوند را وارد کنید.');
      }
    }
  }
  function stop() {
    scanningRequest.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    if (video.current) video.current.srcObject = null;
    setScanning(false);
  }
  return (
    <div className="vitrin-scanner">
      <PageTitle title="اسکنر QR" description="کد QR میز، کافه یا منوی قدیمی را اسکن کنید." />
      <div className="panel stack vitrin-scanner-panel">
        <div className="vitrin-scanner-camera">
          <video ref={video} playsInline muted />
          {scanning ? (
            <button type="button" className="vitrin-camera-stop" onClick={stop}>
              بستن دوربین
            </button>
          ) : (
            <button type="button" className="button secondary" disabled={resolving} onClick={scan}>
              <ScanLine size={18} /> باز کردن دوربین
            </button>
          )}
        </div>
        <Field label="یا آدرس QR را وارد کنید">
          <textarea
            dir="ltr"
            rows={2}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !resolving && value.trim()) {
                e.preventDefault();
                void navigate(value);
              }
            }}
            placeholder="https://..."
          />
        </Field>
        <button
          className="button primary full"
          disabled={resolving || !value.trim()}
          onClick={() => void navigate(value)}
        >
          {resolving ? 'در حال پردازش…' : 'بررسی آدرس'}
        </button>
        {error && <ErrorBox message={error} />}
      </div>
    </div>
  );
}
