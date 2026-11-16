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
      <Link href="/cart" className="selection-cart-checkout">
        مشاهده سبد و پرداخت <ArrowLeft size={18} />
      </Link>
    </aside>
  );
}

export function HomeView() {
  const { data } = useApp();
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
          title="از منوی کافه‌ها"
          description="طعم بعدی‌ات را اینجا پیدا کن"
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
export function CafeView({ id }: { id: string }) {
  const { data: app, toast, cart } = useApp(),
    router = useRouter();
  const { data, loading, error, reload } = useResource<{
    cafe: Cafe;
    products: Product[];
    reviews: Review[];
  }>('cafes/' + id);
  const [tab, setTab] = useState('menu'),
    [category, setCategory] = useState(''),
    [rating, setRating] = useState(5),
    [review, setReview] = useState(''),
    [busy, setBusy] = useState(false);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'کافه پیدا نشد.'} />;
  const { cafe, products, reviews } = data;
  const photos = [...new Set([cafe.image, ...(cafe.images || [])].filter(Boolean))];
  return (
    <div className={'cafe-discovery-page' + (cart.length ? ' has-cart-dock' : '')}>
      <PageTitle
        title={cafe.name}
        description={cafe.description}
        back="/cafes"
        action={<FavoriteButton id={id} />}
      />
      <div className="cafe-detail-top">
        <div className="cafe-gallery">
          <Media className="cafe-cover" src={photos[0] || ''} alt={cafe.name} kind="store" />
          {photos.length > 1 && (
            <div className="cafe-gallery-extra" aria-label="عکس‌های کافه">
              {photos.slice(1).map((photo, index) => (
                <Media
                  key={photo}
                  src={photo}
                  alt={`${cafe.name}، عکس ${digits(index + 2)}`}
                  kind="store"
                />
              ))}
            </div>
          )}
          <div className="cafe-photo-filters">
            {cafe.amenities.length > 0 && (
              <div className="amenity-tags" aria-label="امکانات کافه">
                {cafe.amenities.map((a) => (
                  <span key={a}>{amenities[a] || a}</span>
                ))}
              </div>
            )}
          </div>
        </div>
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
      <nav className="cafe-main-actions" aria-label="خدمات اصلی کافه">
        {cafe.owner_id && cafe.active ? (
          <Link href={'/reserve?cafe=' + id} className="panel cafe-main-action">
            <CalendarDays size={26} />
            <span>
              <strong>رزرو و سفارش</strong>
              <small>منو را ببین، میزت را انتخاب کن و سفارش بده</small>
            </span>
            <ArrowLeft size={20} />
          </Link>
        ) : (
          <button className="panel cafe-main-action" onClick={() => setTab('menu')}>
            <Utensils size={26} />
            <span>
              <strong>منو و رزرو</strong>
              <small>مشاهده منو؛ پذیرش سفارش و رزرو غیرفعال است</small>
            </span>
            <ArrowLeft size={20} />
          </button>
        )}
        <button className="panel cafe-main-action" onClick={() => setTab('events')}>
          <CalendarDays size={26} />
          <span>
            <strong>مشاهده و شرکت در رویداد</strong>
            <small>تمام رویدادها، پیش رو و در حال برگزاری</small>
          </span>
          <ArrowLeft size={20} />
        </button>
      </nav>
      <div className="tabs">
        {[
          { id: 'menu', label: 'منوی کافه' },
          { id: 'reviews', label: 'نظرهای کاربران' },
          { id: 'events', label: 'رویدادهای کافه' },
        ].map((t) => (
          <button
            key={t.id}
            aria-pressed={tab === t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'menu' && (
        <ReservationMenu
          cafeId={id}
          variant="catalog"
          category={category}
          onCategoryChange={setCategory}
        />
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
          {filtered.map((e) => (
            <article className="event-card panel" key={e.id}>
              <Media src={e.image} alt={e.title} />
              <span className="eyebrow">{e.cafe_name}</span>
              <span className={'badge event-phase event-phase-' + eventPhase(e, now)}>
                {eventPhaseLabels[eventPhase(e, now)]}
              </span>
              <h3>{e.title}</h3>
              <p>
                <CalendarDays size={16} />
                {dateLabel(e.date)} · {digits(e.time)}
                {e.end_time ? ' تا ' + digits(e.end_time) : ''}
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
export function EventsView({ id }: { id?: string }) {
  const { data, refresh, toast } = useApp(),
    router = useRouter();
  const [busy, setBusy] = useState(false);
  const now = useEventNow();
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
          <span className={'badge event-phase event-phase-' + eventPhase(event, now)}>
            {eventPhaseLabels[eventPhase(event, now)]}
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
          <button
            className="button primary"
            disabled={
              busy ||
              (!event.joined &&
                (event.registered >= event.capacity ||
                  !['upcoming', 'ongoing'].includes(eventPhase(event, now))))
            }
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
