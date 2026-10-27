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
  Bike,
  ShoppingBag,
  CalendarDays,
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
import { api, useApp, useResource } from '@/lib/client';
import { CafeMap } from './location-map';
import { money, digits, dateLabel, amenities, today } from '@/lib/format';
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

export function FavoriteButton({ id }: { id: string }) {
  const { data, refresh, toast } = useApp();
  const router = useRouter();
  const selected = data?.favorites.includes(id);
  return (
    <button
      className={'favorite-button ' + (selected ? 'selected' : '')}
      aria-label={selected ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'}
      aria-pressed={selected}
      onClick={async (e) => {
        e.preventDefault();
        if (!data?.user) {
          router.push('/login');
          return;
        }
        try {
          await api('favorites/' + id, 'POST', {});
          await refresh();
        } catch (e) {
          toast((e as Error).message);
        }
      }}
    >
      <Heart size={19} fill={selected ? 'currentColor' : 'none'} />
    </button>
  );
}
export function CafeCard({ cafe }: { cafe: Cafe }) {
  return (
    <article className="cafe-card">
      <div className="card-visual">
        <Link href={'/cafes/' + cafe.id}>
          <Media src={cafe.image} alt={cafe.name} kind="store" />
        </Link>
        <FavoriteButton id={cafe.id} />
        <span className={'cafe-label ' + (!cafe.owner_id ? 'source-label' : '')}>
          {cafe.owner_id ? (cafe.active ? 'رزرو و سفارش آنلاین' : 'معرفی کافه') : 'از ویترین کافه'}
        </span>
      </div>
      <div className="card-body">
        <div className="card-heading">
          <Link href={'/cafes/' + cafe.id}>
            <h3>{cafe.name}</h3>
          </Link>
          {cafe.rating ? (
            <span className="rating">
              <Star size={15} fill="currentColor" />
              {digits(cafe.rating.toFixed(1))}
            </span>
          ) : (
            <span className="new-label">تازه در ویتکو</span>
          )}
        </div>
        <p>
          <MapPin size={14} />
          {cafe.city} · {cafe.address}
        </p>
        <div className="card-bottom">
          <div className="amenity-icons">
            {cafe.amenities.includes('wifi') && (
              <span title="اینترنت رایگان">
                <Wifi size={16} />
              </span>
            )}
            {cafe.amenities.includes('music') && (
              <span title="موسیقی زنده">
                <Music2 size={16} />
              </span>
            )}
            {cafe.amenities.includes('family') && (
              <span title="مناسب خانواده">
                <Users size={16} />
              </span>
            )}
            {cafe.amenities.includes('outdoor') && (
              <span title="فضای باز">
                <Leaf size={16} />
              </span>
            )}
          </div>
          <Link className="text-link" href={'/cafes/' + cafe.id}>
            کشف این کافه
            <ArrowUpLeft size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}
export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="product-card">
      <Link href={'/products/' + product.id}>
        <Media src={product.image} alt={product.name} />
      </Link>
      <div className="product-card-body">
        <span className="category-caption">{product.category}</span>
        {!product.available && <span className="badge product-unavailable">ناموجود</span>}
        <Link href={'/products/' + product.id}>
          <h3>{product.name}</h3>
        </Link>
        <p>{product.description}</p>
        <div className="product-card-bottom">
          <strong>{money(product.price)}</strong>
          <Link
            className="round-button"
            href={'/products/' + product.id}
            aria-label={'مشاهده ' + product.name}
          >
            <ArrowUpLeft size={20} />
          </Link>
        </div>
      </div>
    </article>
  );
}
export function HomeView() {
  const { data, setMode } = useApp();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const cafes = data?.cafes || [];
  const products = data?.products.filter((p) => p.available) || [];
  return (
    <div className="vitco-home">
      <header className="home-greeting">
        <div>
          <span className="eyebrow">به وقتِ یک حال خوب</span>
          <h1>{data?.user ? `سلام، ${data.user.name.split(' ')[0]}` : 'به ویتکو خوش آمدی'}</h1>
          <p>امروز، کجا قرار بگذاریم؟</p>
        </div>
        <Link href="/cafes" className="home-location">
          <MapPin size={16} aria-hidden="true" /> کافه‌های ایران
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
          <nav className="home-services" aria-label="خدمات ویتکو">
            <Link href="/menu?mode=delivery" onClick={() => setMode('delivery')}>
              <span>
                <Bike size={22} />
              </span>
              <strong>ارسال به آدرس</strong>
              <small>کافه، هر جا که هستی</small>
            </Link>
            <Link href="/menu?mode=pickup" onClick={() => setMode('pickup')}>
              <span>
                <ShoppingBag size={22} />
              </span>
              <strong>تحویل از کافه</strong>
              <small>سفارش بده، سر راه بردار</small>
            </Link>
            <Link href="/reserve">
              <span>
                <CalendarDays size={22} />
              </span>
              <strong>رزرو میز</strong>
              <small>برای قرار بعدی‌ات</small>
            </Link>
          </nav>
        </div>
      </div>
      {data?.user && <MemberHome />}
      <section className="home-menu-section">
        <SectionTitle
          title="از منوی کافه‌ها"
          description="طعم بعدی‌ات را اینجا پیدا کن"
          href="/menu"
          label="همه منوها"
        />
        {products.length ? (
          <div className="product-grid">
            {products.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <Empty
            title="منوها در راه‌اند"
            description="محصولات کافه‌ها پس از ثبت و فعال‌شدن، اینجا نمایش داده می‌شوند."
            href="/cafes"
            label="دیدن کافه‌ها"
          />
        )}
      </section>
      <section className="home-cafes-section">
        <SectionTitle
          title="قرار بعدی، کدام کافه؟"
          description="فضاها و منوها را بشناس، بعد انتخاب کن"
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
        {cafes.length ? (
          <div className="home-cafe-grid">
            {cafes.slice(0, 3).map((c) => (
              <CafeCard key={c.id} cafe={c} />
            ))}
          </div>
        ) : (
          <Empty
            title="اولین کافه، اولین قرار"
            description="هنوز کافه‌ای برای نمایش ثبت نشده است."
            href="/dashboard"
            label="ثبت کافه"
            icon="store"
          />
        )}
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
              {last.mode === 'delivery' ? 'ارسال به آدرس' : 'تحویل از کافه'}
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
  const { data } = useApp(),
    query = useSearchParams(),
    router = useRouter();
  const [search, setSearch] = useState(query.get('q') || ''),
    [city, setCity] = useState(''),
    [amenity, setAmenity] = useState(query.get('amenity') || ''),
    [online, setOnline] = useState(false),
    [view, setView] = useState('grid'),
    [filters, setFilters] = useState(false);
  useEffect(() => {
    setSearch(query.get('q') || '');
    setAmenity(query.get('amenity') || '');
  }, [query]);
  const cafes = (data?.cafes || []).filter(
    (c) =>
      (!favorites || data?.favorites.includes(c.id)) &&
      (!search || [c.name, c.city, c.address].some((v) => v.includes(search))) &&
      (!city || c.city === city) &&
      (!amenity || c.amenities.includes(amenity)) &&
      (!online || (c.active && c.owner_id)),
  );
  return (
    <>
      <PageTitle
        title={favorites ? 'کافه‌های دوست‌داشتنی من' : 'کافه‌گردی'}
        description={
          favorites
            ? 'جای خوب را برای قرار بعدی نگه دار.'
            : 'از میان کافه‌های شهر، جای دلخواهت را پیدا کن.'
        }
        action={
          <Link href="/reserve" className="button primary">
            <CalendarDays size={18} />
            رزرو میز
          </Link>
        }
      />
      {favorites && !data?.user ? (
        <LoginGate>
          <span />
        </LoginGate>
      ) : (
        <>
          <div className="catalog-toolbar">
            <div className="search-input">
              <Search size={20} />
              <input
                aria-label="جستجوی کافه‌ها"
                placeholder="نام کافه، شهر یا محله…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button aria-label="پاک کردن جستجو" onClick={() => setSearch('')}>
                  <X size={16} />
                </button>
              )}
            </div>
            <button
              className={'button secondary ' + (filters ? 'selected' : '')}
              onClick={() => setFilters(!filters)}
            >
              <SlidersHorizontal size={18} />
              فیلترها{(city || amenity || online) && <span className="tiny-dot" />}
            </button>
            <div className="view-toggle">
              <button
                aria-label="نمای فهرست"
                aria-pressed={view === 'grid'}
                className={view === 'grid' ? 'selected' : ''}
                onClick={() => setView('grid')}
              >
                <LayoutGrid size={19} />
              </button>
              <button
                aria-label="نمای نقشه"
                aria-pressed={view === 'map'}
                className={view === 'map' ? 'selected' : ''}
                onClick={() => setView('map')}
              >
                <Map size={19} />
              </button>
            </div>
          </div>
          {filters && (
            <div className="filter-panel">
              <Field label="شهر">
                <select value={city} onChange={(e) => setCity(e.target.value)}>
                  <option value="">همه شهرها</option>
                  {[...new Set(data?.cafes.map((c) => c.city))].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="امکانات">
                <select value={amenity} onChange={(e) => setAmenity(e.target.value)}>
                  <option value="">همه امکانات</option>
                  {Object.entries(amenities).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={online}
                  onChange={(e) => setOnline(e.target.checked)}
                />
                رزرو و سفارش فعال
              </label>
              <button
                className="text-link"
                onClick={() => {
                  setCity('');
                  setAmenity('');
                  setOnline(false);
                  setSearch('');
                }}
              >
                پاک کردن فیلترها
              </button>
            </div>
          )}
          <div className="results-meta">
            <span>{digits(cafes.length)} کافه پیدا شد</span>
            <span>به ترتیب تازه‌ترین‌ها</span>
          </div>
          {view === 'map' ? (
            <CafeMap cafes={cafes} />
          ) : cafes.length ? (
            <div className="cafe-grid">
              {cafes.map((c) => (
                <CafeCard key={c.id} cafe={c} />
              ))}
            </div>
          ) : (
            <Empty
              title={
                favorites ? 'هنوز کافه‌ای را ذخیره نکرده‌ای' : 'کافه‌ای با این مشخصات پیدا نشد'
              }
              description={
                favorites
                  ? 'قلب کنار کافه‌های دلخواهت را بزن تا اینجا پیدایشان کنی.'
                  : 'نام یا فیلترهای جستجو را تغییر بده و دوباره امتحان کن.'
              }
              href={favorites ? '/cafes' : undefined}
            />
          )}
        </>
      )}
    </>
  );
}
export function CafeView({ id }: { id: string }) {
  const { data: app, toast } = useApp(),
    router = useRouter();
  const { data, loading, error, reload } = useResource<{
    cafe: Cafe;
    products: Product[];
    reviews: Review[];
  }>('cafes/' + id);
  const [tab, setTab] = useState('menu'),
    [rating, setRating] = useState(5),
    [review, setReview] = useState(''),
    [busy, setBusy] = useState(false);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'کافه پیدا نشد.'} />;
  const { cafe, products, reviews } = data;
  return (
    <>
      <PageTitle
        title={cafe.name}
        description={cafe.description}
        back="/cafes"
        action={<FavoriteButton id={id} />}
      />
      <div className="cafe-detail-top">
        <Media className="cafe-cover" src={cafe.image} alt={cafe.name} kind="store" />
        <div className="panel cafe-information">
          <span className="eyebrow">یک قرار تازه در {cafe.city}</span>
          <h2>{cafe.name}</h2>
          <p>
            <MapPin size={18} />
            {cafe.address}
          </p>
          {cafe.owner_id && (
            <p>
              <Clock3 size={18} />
              {digits(cafe.opens)} تا {digits(cafe.closes)}
            </p>
          )}
          <div className="amenity-tags">
            {cafe.amenities.map((a) => (
              <span key={a}>{amenities[a] || a}</span>
            ))}
          </div>
          {cafe.owner_id ? (
            <div className="button-row">
              <Link href={'/reserve?cafe=' + id} className="button primary">
                <CalendarDays size={18} />
                رزرو میز
              </Link>
              <a className="button secondary" href={'tel:' + cafe.phone}>
                <Phone size={18} />
                تماس
              </a>
            </div>
          ) : (
            <div className="source-note">
              اطلاعات این کافه از{' '}
              <a href={cafe.source} target="_blank" rel="noreferrer">
                ویترین کافه
              </a>{' '}
              دریافت شده است. رزرو و سفارش آنلاین این کافه در این سامانه فعال نیست.
            </div>
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
      </div>
      <div className="tabs">
        {[
          { id: 'menu', label: 'منوی کافه' },
          { id: 'reviews', label: 'نظرهای کاربران' },
          { id: 'events', label: 'رویدادهای کافه' },
        ].map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'menu' &&
        (products.length ? (
          <div className="product-grid">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <Empty
            title="منوی این کافه هنوز ثبت نشده"
            description="پس از ثبت محصولات توسط کافه، منو همین‌جا نمایش داده می‌شود."
          />
        ))}
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
                await api('reviews/' + id, 'POST', { rating, body: review });
                setReview('');
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
            <Submit busy={busy}>ثبت نظر</Submit>
          </form>
        </div>
      )}
      {tab === 'events' && <EventList events={app?.events.filter((e) => e.cafe_id === id) || []} />}
    </>
  );
}
export function MenuView() {
  const { data, mode, setMode, cart } = useApp(),
    q = useSearchParams();
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState(''),
    [cafe, setCafe] = useState(q.get('cafe') || '');
  useEffect(() => {
    if (q.get('mode') === 'delivery' || q.get('mode') === 'pickup')
      setMode(q.get('mode') as 'delivery' | 'pickup');
  }, [q]);
  const products = data?.products || [];
  const filtered = products.filter(
    (p) =>
      (!search || p.name.includes(search) || p.description.includes(search)) &&
      (!category || p.category === category) &&
      (!cafe || p.cafe_id === cafe),
  );
  return (
    <div className={'vitco-menu' + (cart.length ? ' has-cart-dock' : '')}>
      <PageTitle
        title="منوی کافه‌ها"
        description="برای یک استراحت کوتاه، یک طعم تازه انتخاب کن."
        action={
          <Link href="/cart" className="button primary" aria-label="سبد خرید">
            <ShoppingBag size={18} />
            <span>سبد خرید</span>
          </Link>
        }
      />
      <div className="menu-toolbar">
        <div className="segmented">
          <button
            className={mode === 'delivery' ? 'active' : ''}
            aria-pressed={mode === 'delivery'}
            onClick={() => setMode('delivery')}
          >
            <Bike size={18} />
            ارسال به آدرس
          </button>
          <button
            className={mode === 'pickup' ? 'active' : ''}
            aria-pressed={mode === 'pickup'}
            onClick={() => setMode('pickup')}
          >
            <Store size={18} />
            تحویل از کافه
          </button>
        </div>
        <select aria-label="انتخاب کافه" value={cafe} onChange={(e) => setCafe(e.target.value)}>
          <option value="">همه کافه‌ها</option>
          {data?.cafes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="search-input full">
        <Search size={20} />
        <input
          aria-label="جستجوی منو"
          placeholder="امروز هوس چه طعمی کردی؟"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="category-tabs" role="group" aria-label="دسته‌بندی منو">
        <button
          className={!category ? 'active' : ''}
          aria-pressed={!category}
          onClick={() => setCategory('')}
        >
          <Utensils size={19} />
          همه طعم‌ها
        </button>
        {[...new Set(products.map((p) => p.category))].map((c) => (
          <button
            key={c}
            className={category === c ? 'active' : ''}
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            <Coffee size={19} />
            {c}
          </button>
        ))}
      </div>
      <div className="menu-results" role="status">
        <span>{digits(filtered.length)} طعم برای انتخاب</span>
        <small>{data?.cafes.find((item) => item.id === cafe)?.name || 'از منوی کافه‌ها'}</small>
      </div>
      {filtered.length ? (
        <div className="product-grid">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <Empty
          title="طعمی با این مشخصات پیدا نشد"
          description="نام محصول یا دسته‌بندی دیگری را امتحان کن."
        />
      )}
      {cart.length > 0 && (
        <Link href="/cart" className="menu-cart-dock">
          <span className="dock-count">
            {digits(cart.reduce((sum, item) => sum + item.quantity, 0))}
          </span>
          <span>انتخاب‌هایت در سبد منتظرند</span>
          <strong>
            مشاهده سبد <ArrowLeft size={18} />
          </strong>
        </Link>
      )}
    </div>
  );
}
export function ProductView({ id }: { id: string }) {
  const { data, cart, addCart, setCart, toast } = useApp();
  const p = data?.products.find((p) => p.id === id),
    cafe = data?.cafes.find((c) => c.id === p?.cafe_id);
  const [size, setSize] = useState(p?.sizes[0]?.id || ''),
    [addons, setAddons] = useState<string[]>([]),
    [quantity, setQuantity] = useState(1),
    [note, setNote] = useState(''),
    [replace, setReplace] = useState(false),
    [added, setAdded] = useState(false);
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
          <Media className="product-large" src={p.image} alt={p.name} />
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
function EventList({ events }: { events: CafeEvent[] }) {
  return events.length ? (
    <div className="cafe-grid">
      {events.map((e) => (
        <article className="event-card panel" key={e.id}>
          <Media src={e.image} alt={e.title} />
          <span className="eyebrow">{e.cafe_name}</span>
          <h3>{e.title}</h3>
          <p>
            <CalendarDays size={16} />
            {dateLabel(e.date)} · {digits(e.time)}
          </p>
          <Link className="button secondary" href={'/events/' + e.id}>
            جزئیات رویداد
            <ArrowLeft size={16} />
          </Link>
        </article>
      ))}
    </div>
  ) : (
    <Empty
      title="قرارهای تازه در راه‌اند"
      description="هنوز رویدادی ثبت نشده است. کافه‌ها پس از انتشار رویداد، همین‌جا میزبان شما خواهند بود."
      href="/cafes"
    />
  );
}
export function EventsView({ id }: { id?: string }) {
  const { data, refresh, toast } = useApp(),
    router = useRouter();
  const [busy, setBusy] = useState(false);
  const event = data?.events.find((e) => e.id === id);
  if (!id)
    return (
      <>
        <PageTitle
          title="رویدادهای کافه‌ها"
          description="دورهمی، موسیقی و تجربه‌های تازه؛ بهانه‌هایی برای دیدار."
        />
        <EventList events={data?.events || []} />
      </>
    );
  if (!event)
    return (
      <Empty
        title="رویداد پیدا نشد"
        description="فهرست رویدادهای کافه‌ها را ببین."
        href="/events"
        label="همه رویدادها"
      />
    );
  return (
    <>
      <PageTitle title={event.title} back="/events" description={event.cafe_name} />
      <div className="two-columns">
        <Media src={event.image} alt={event.title} className="event-cover" />
        <div className="panel form">
          <h2>{event.title}</h2>
          <p>{event.description}</p>
          <div className="list-row">
            <span>تاریخ</span>
            <strong>{dateLabel(event.date)}</strong>
          </div>
          <div className="list-row">
            <span>ساعت</span>
            <strong>{digits(event.time)}</strong>
          </div>
          <div className="list-row">
            <span>ظرفیت باقی‌مانده</span>
            <strong>{digits(Math.max(0, event.capacity - event.registered))} نفر</strong>
          </div>
          <button
            className="button primary"
            disabled={busy || (!event.joined && event.registered >= event.capacity)}
            onClick={async () => {
              if (!data?.user) {
                router.push('/login');
                return;
              }
              setBusy(true);
              try {
                await api('events/' + id + (event.joined ? '/leave' : ''), 'POST', {});
                await refresh();
                toast(event.joined ? 'ثبت‌نام لغو شد.' : 'ثبت‌نام شما انجام شد.');
              } catch (e) {
                toast((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {event.joined ? 'لغو ثبت‌نام' : 'شرکت در رویداد'}
          </button>
        </div>
      </div>
    </>
  );
}
export function InfoView({ page }: { page: string }) {
  const content: Record<string, { title: string; intro: string; paragraphs: string[] }> = {
    about: {
      title: 'هر کافه، یک دنیای تازه',
      intro: 'ویتکو؛ قرارِ لحظه‌های خوب',
      paragraphs: [
        'در ویتکو، کافه‌های شهر را کشف می‌کنید، منوها و فضاها را می‌شناسید و برای دیدارهای بعدی برنامه می‌ریزید. از گوشه‌ای آرام برای کار تا یک دورهمی دوستانه؛ انتخاب با شماست.',
        'کافه‌ها می‌توانند صفحه خود را بسازند، منو و رویدادها را منتشر کنند و سفارش‌ها و رزروهایشان را در یک‌جا مدیریت کنند.',
        'اطلاعات اولیه کافه اعلا از وب‌سایت ویترین کافه دریافت شده است. سفارش و رزرو در این برنامه فقط برای کافه‌هایی فعال است که صاحب آن‌ها خدمات خود را در همین سامانه ارائه می‌کند.',
      ],
    },
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
        'پرداخت سفارش هنگام تحویل یا در کافه انجام می‌شود. این برنامه اطلاعات کارت بانکی دریافت نمی‌کند و پرداخت اینترنتی ندارد.',
        'سفارش تا پیش از شروع آماده‌سازی قابل لغو است. رزروهای در انتظار تأیید یا تأییدشده از حساب شما قابل لغو هستند.',
        'صاحب کافه مسئول درستی اطلاعات، قیمت‌ها، ظرفیت و اجرای سفارش‌ها و رزروهاست. نظرات باید بر تجربه واقعی مبتنی باشند.',
      ],
    },
  };
  if (page === 'contact')
    return (
      <>
        <PageTitle
          title="همراه شما هستیم"
          description="سؤال، پیشنهاد یا مسئله‌ای داری؟ از اینجا شروع کن."
        />
        <div className="panel prose">
          <HeadphonesIllustration />
          <h2>گفت‌وگو با پشتیبانی ویتکو</h2>
          <p>
            برای پیگیری سفارش یا مطرح کردن سؤال، یک درخواست در حساب خود ثبت کنید. درخواست‌های مرتبط
            با سفارش در پنل کافه نیز قابل مشاهده هستند.
          </p>
          <Link className="button primary" href="/support">
            ثبت درخواست پشتیبانی
            <ArrowLeft size={17} />
          </Link>
          <a
            className="text-link"
            href="https://vitrincafe.ir/contact"
            target="_blank"
            rel="noreferrer"
          >
            صفحه تماس ویترین کافه
            <ArrowUpLeft size={16} />
          </a>
        </div>
      </>
    );
  const item = content[page] || content.about;
  return (
    <>
      <PageTitle title={item.title} description={item.intro} />
      <article className="panel prose">
        {page === 'about' && (
          <img className="about-image" src="/images/coop.webp" alt="همراهی با ویترین کافه" />
        )}
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
function HeadphonesIllustration() {
  return (
    <div className="empty-icon">
      <Coffee size={34} />
    </div>
  );
}
export function ScannerView() {
  const router = useRouter(),
    video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null);
  const [value, setValue] = useState(''),
    [error, setError] = useState(''),
    [scanning, setScanning] = useState(false);
  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);
  function navigate(raw: string) {
    try {
      const url = new URL(raw, window.location.origin);
      if (
        url.origin !== window.location.origin ||
        !/^\/(cafes|products)\/[a-zA-Z0-9-]+$/.test(url.pathname)
      )
        throw new Error();
      router.push(url.pathname);
    } catch {
      setError('پیوند باید مربوط به صفحه یک کافه یا محصول در همین سامانه باشد.');
    }
  }
  async function scan() {
    setError('');
    const Detector = (
      window as unknown as {
        BarcodeDetector?: new (options: { formats: string[] }) => {
          detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
        };
      }
    ).BarcodeDetector;
    if (!Detector) {
      setError('اسکن با دوربین در این مرورگر پشتیبانی نمی‌شود. پیوند کافه را وارد کنید.');
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      setScanning(true);
      if (video.current) {
        video.current.srcObject = stream.current;
        await video.current.play();
        const detector = new Detector({ formats: ['qr_code'] });
        const tick = async () => {
          if (!stream.current?.active || !video.current) return;
          const codes = await detector.detect(video.current);
          if (codes.length) {
            stream.current.getTracks().forEach((t) => t.stop());
            setScanning(false);
            navigate(codes[0].rawValue);
          } else requestAnimationFrame(tick);
        };
        void tick();
      }
    } catch {
      setError('دسترسی به دوربین ممکن نشد. اجازه دوربین را بررسی کنید.');
    }
  }
  return (
    <>
      <PageTitle title="اسکن منوی کافه" description="کد کافه را اسکن کن و مستقیم به منو برس." />
      <div className="panel narrow form">
        <ScanLine size={44} />
        <video ref={video} playsInline muted className={scanning ? 'scanner-video' : 'hidden'} />
        <button className="button primary" onClick={scan}>
          باز کردن دوربین
        </button>
        <Field label="یا پیوند کافه را وارد کن">
          <input
            dir="ltr"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="نشانی صفحه کافه"
          />
        </Field>
        <button className="button secondary" onClick={() => navigate(value)}>
          باز کردن منو
        </button>
        {error && <ErrorBox message={error} />}
      </div>
    </>
  );
}
