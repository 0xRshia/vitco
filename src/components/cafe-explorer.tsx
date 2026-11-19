'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import {
  ArrowLeft,
  List,
  LocateFixed,
  Map,
  MapPin,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useApp } from '@/lib/client';
import { digits, amenities } from '@/lib/format';
import { menuCategories, productCategory } from '@/lib/catalog';
import {
  cafeSortLabels,
  discoverCafes,
  hasCoordinates,
  type CafeFilters,
  type CafeSort,
  type GeoPoint,
} from '@/lib/cafe-discovery';
import type { Cafe } from '@/lib/types';
import { CafeCard } from './browse-cards';
import { ExplorerCafeCard } from './explorer-cafe-card';
import { MapCanvas, type MapBounds as Bounds } from './map-canvas';
import { Empty, Field, LoginGate, Modal, PageTitle } from './ui';
import { MapMenuButton, VitrinFooter } from './vitrin-layout';

type Camera = { points: GeoPoint[]; zoom?: number; revision: number };
type MappedCafe = Cafe & GeoPoint;

export function CafeExplorer({
  favorites = false,
  listOnly = false,
}: {
  favorites?: boolean;
  listOnly?: boolean;
}) {
  const { data } = useApp(),
    query = useSearchParams();
  const readFilters = (): CafeFilters => ({
    search: query.get('q') || '',
    city: query.get('city') || '',
    category: productCategory(query.get('category') || ''),
    amenities: (query.get('amenity') || '').split(',').filter((key) => key in amenities),
    online: query.get('online') === '1',
    discount: query.get('discount') === '1',
    sort:
      query.get('sort') && query.get('sort')! in cafeSortLabels
        ? (query.get('sort') as CafeSort)
        : 'recommended',
  });
  const [filters, setFilters] = useState<CafeFilters>(readFilters),
    [draft, setDraft] = useState(filters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(40);
  const [origin, setOrigin] = useState<GeoPoint | null>(null),
    [bounds, setBounds] = useState<Bounds | null>(null);
  const [locating, setLocating] = useState(false),
    [locationError, setLocationError] = useState('');
  const [camera, setCamera] = useState<Camera | null>(null),
    [selected, setSelected] = useState('');
  const [snap, setSnap] = useState<'collapsed' | 'preview' | 'expanded'>(() =>
    query.get('q')?.trim() ? 'expanded' : 'preview',
  );
  const [dragHeight, setDragHeight] = useState<number | null>(null),
    [height, setHeight] = useState(800);
  const page = useRef<HTMLDivElement>(null),
    list = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; y: number; height: number; moved: boolean } | null>(null);
  const dragged = useRef(false),
    locationRequest = useRef(0);
  const mapView = !listOnly && !favorites && query.get('view') !== 'list';
  const path = favorites ? '/favorites' : listOnly ? '/menu' : '/cafes';
  const source = useMemo(
    () => (data?.cafes || []).filter((c) => !favorites || data?.favorites.includes(c.id)),
    [data, favorites],
  );
  const cafes = useMemo(
    () => discoverCafes(source, data?.products || [], filters, origin),
    [source, data?.products, filters, origin],
  );
  const mapped = useMemo(() => cafes.filter((c): c is MappedCafe => hasCoordinates(c)), [cafes]);
  const active = cafes.find((c) => c.id === selected);
  const searching = Boolean(filters.search.trim());
  const matches = cafes.filter(
    (c) =>
      !c.is_demo &&
      (searching ||
        !bounds ||
        !hasCoordinates(c) ||
        (c.latitude >= bounds.south &&
          c.latitude <= bounds.north &&
          c.longitude >= bounds.west &&
          c.longitude <= bounds.east)),
  );
  const results = active ? [active, ...matches.filter((cafe) => cafe.id !== active.id)] : matches;
  const cities = [...new Set(source.map((c) => c.city).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'fa'),
  );
  const demo = data?.cafes.find((c) => c.is_demo && c.active);
  const directoryNotice =
    data?.directory?.status === 'stale'
      ? 'آخرین اطلاعات ذخیره‌شده نمایش داده می‌شود؛ اطلاعات تازه هنوز دریافت نشده است.'
      : data?.directory?.status === 'unavailable'
        ? 'اطلاعات کافه‌های همقدم هنوز دریافت نشده است. کمی بعد دوباره تلاش کنید.'
        : '';
  const activeCount =
    Number(Boolean(filters.city)) +
    Number(Boolean(filters.category)) +
    filters.amenities.length +
    Number(filters.online) +
    Number(filters.discount) +
    Number(filters.sort !== 'recommended');
  const openFilters = () => {
    setDraft(filters);
    setFilterOpen(true);
  };
  const maximumDrawer = Math.max(80, height - 54);
  const snaps = {
    collapsed: Math.min(116, maximumDrawer),
    preview: Math.min(active ? height * 0.5 : height * 0.2 + 76, maximumDrawer),
    expanded: maximumDrawer,
  };
  useEffect(() => {
    setFilters(readFilters());
  }, [query]);
  useEffect(() => {
    if (!mapView || !page.current) return;
    const observer = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    observer.observe(page.current);
    return () => observer.disconnect();
  }, [mapView]);
  useEffect(() => {
    setVisibleCount(40);
  }, [filters, bounds]);
  useEffect(() => {
    if (selected && !active) setSelected('');
  }, [selected, active]);
  useEffect(() => {
    list.current?.scrollTo({ top: 0 });
  }, [selected]);
  useEffect(() => {
    if (mapView) locate();
    return () => {
      locationRequest.current++;
    };
  }, [mapView]);
  function update(patch: Partial<CafeFilters>, view?: 'map' | 'list') {
    const next = { ...filters, ...patch };
    setFilters(next);
    setSelected('');
    const params = new URLSearchParams({
      q: next.search,
      city: next.city,
      category: next.category,
      amenity: next.amenities.join(','),
      online: next.online ? '1' : '',
      discount: next.discount ? '1' : '',
      sort: next.sort === 'recommended' ? '' : next.sort,
      view: view || (!mapView ? 'list' : ''),
    });
    for (const [key, value] of [...params])
      if (!value || (listOnly && key === 'view')) params.delete(key);
    window.history.replaceState(null, '', path + (params.size ? '?' + params : ''));
    if ('city' in patch) {
      const points = discoverCafes(source, data?.products || [], next, origin).filter(
        (c): c is MappedCafe => hasCoordinates(c),
      );
      setCamera((current) => ({ points, revision: (current?.revision || 0) + 1 }));
    }
  }
  function locate() {
    const request = ++locationRequest.current;
    if (!navigator.geolocation) {
      setLocationError('مرورگر به موقعیت دسترسی ندارد. شهر را انتخاب کنید یا نقشه را حرکت دهید.');
      return;
    }
    setLocating(true);
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (request !== locationRequest.current) return;
        const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setOrigin(point);
        setCamera((current) => ({
          points: [point],
          zoom: 14,
          revision: (current?.revision || 0) + 1,
        }));
        setLocating(false);
      },
      () => {
        if (request !== locationRequest.current) return;
        setLocationError(
          'موقعیت دریافت نشد. دسترسی موقعیت را فعال کنید یا شهر و محدوده نقشه را انتخاب کنید.',
        );
        setLocating(false);
      },
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false },
    );
  }
  function select(id: string) {
    setSelected(id);
    setSnap('preview');
  }
  function searchFor(value: string) {
    update({ search: value });
    if (mapView && value.trim()) {
      setSnap('expanded');
      list.current?.scrollTo({ top: 0 });
    }
  }
  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    dragged.current = false;
    drag.current = {
      pointer: event.pointerId,
      y: event.clientY,
      height: snaps[snap],
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current || drag.current.pointer !== event.pointerId) return;
    const delta = drag.current.y - event.clientY;
    if (Math.abs(delta) > 5) {
      drag.current.moved = true;
      dragged.current = true;
    }
    setDragHeight(Math.max(snaps.collapsed, Math.min(snaps.expanded, drag.current.height + delta)));
  }
  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current || drag.current.pointer !== event.pointerId) return;
    if (drag.current.moved) {
      const target = drag.current.height + drag.current.y - event.clientY;
      setSnap(
        (Object.keys(snaps) as (keyof typeof snaps)[]).reduce(
          (best, key) =>
            Math.abs(snaps[key] - target) < Math.abs(snaps[best] - target) ? key : best,
          'collapsed',
        ),
      );
    }
    drag.current = null;
    setDragHeight(null);
  }
  const controls = (
    <>
      <form
        className="explorer-search"
        onSubmit={(event) => {
          event.preventDefault();
          update({ search: filters.search });
          event.currentTarget.querySelector('input')?.blur();
        }}
      >
        <Search size={20} />
        <input
          aria-label="جستجوی کافه‌ها"
          enterKeyHint="search"
          placeholder={mapView ? 'جستجوی کافه‌ها…' : 'جستجوی کافه یا محله'}
          value={filters.search}
          onChange={(event) => searchFor(event.target.value)}
        />
        {filters.search && (
          <button type="button" aria-label="پاک کردن جستجو" onClick={() => update({ search: '' })}>
            <X size={18} />
          </button>
        )}
        <button
          type="button"
          className={'explorer-filter-trigger' + (activeCount ? ' selected' : '')}
          aria-label={'فیلترها' + (activeCount ? ' · ' + digits(activeCount) + ' فعال' : '')}
          onClick={openFilters}
        >
          <SlidersHorizontal size={20} />
          {activeCount > 0 && <span>{digits(activeCount)}</span>}
        </button>
      </form>
      {!mapView && !favorites && (
        <Link
          className="text-link explorer-view-link"
          href={
            '/cafes?' +
            new URLSearchParams(
              [...query].filter(([key]) => key !== 'view' && key !== 'cafe'),
            ).toString()
          }
        >
          <Map size={17} /> نمایش روی نقشه
        </Link>
      )}
    </>
  );
  const sheets = (
    <>
      <Modal
        open={filterOpen}
        title="فیلتر کافه‌ها"
        presentation="sheet"
        onClose={() => setFilterOpen(false)}
      >
        <div className="explorer-filters form">
          <Field label="شهر">
            <select
              value={draft.city}
              onChange={(event) => setDraft({ ...draft, city: event.target.value })}
            >
              <option value="">همه شهرها</option>
              {cities.map((city) => (
                <option key={city}>{city}</option>
              ))}
            </select>
          </Field>
          {source.some((c) => !c.city) && (
            <small className="muted">
              شهر بعضی کافه‌ها در منبع مشخص نشده است؛ برای دیدن همه، «همه شهرها» را انتخاب کن.
            </small>
          )}
          <Field label="مرتب‌سازی براساس">
            <select
              value={draft.sort}
              onChange={(event) => setDraft({ ...draft, sort: event.target.value as CafeSort })}
            >
              {Object.entries(cafeSortLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="دسته‌بندی منو">
            <select
              value={draft.category}
              onChange={(event) => setDraft({ ...draft, category: event.target.value })}
            >
              <option value="">همه طعم‌ها</option>
              {menuCategories(data?.products || []).map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </Field>
          <fieldset>
            <legend>فضا و امکانات</legend>
            {Object.entries(amenities).map(([key, label]) => (
              <label className="explorer-filter-option" key={key}>
                {label}
                <input
                  type="checkbox"
                  checked={draft.amenities.includes(key)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      amenities: event.target.checked
                        ? [...draft.amenities, key]
                        : draft.amenities.filter((a) => a !== key),
                    })
                  }
                />
              </label>
            ))}
          </fieldset>
          <label className="explorer-filter-option">
            رزرو و سفارش فعال
            <input
              type="checkbox"
              checked={draft.online}
              onChange={(event) => setDraft({ ...draft, online: event.target.checked })}
            />
          </label>
          <label className="explorer-filter-option">
            دارای تخفیف حضوری
            <input
              type="checkbox"
              checked={draft.discount}
              onChange={(event) => setDraft({ ...draft, discount: event.target.checked })}
            />
          </label>
          {mapView && (
            <div className="explorer-mobile-tools">
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setFilterOpen(false);
                  update({}, 'list');
                }}
              >
                <List size={18} /> فهرست کافه‌ها
              </button>
              <MapMenuButton onBeforeOpen={() => setFilterOpen(false)} />
            </div>
          )}
          {mapView && (
            <button
              className="button secondary"
              onClick={() => {
                update(draft);
                setCamera((current) => ({
                  points: discoverCafes(source, data?.products || [], draft, origin).filter(
                    (c): c is MappedCafe => hasCoordinates(c),
                  ),
                  revision: (current?.revision || 0) + 1,
                }));
                setSnap('preview');
                setFilterOpen(false);
              }}
            >
              نمایش همه کافه‌ها روی نقشه
            </button>
          )}
          {demo && (
            <Link className="text-link" href={'/reserve?cafe=' + demo.id}>
              آزمایش رزرو میز در کافه آزمایشی
            </Link>
          )}
          <div className="explorer-sheet-actions">
            <button
              className="button primary"
              onClick={() => {
                update(draft);
                setFilterOpen(false);
                if (draft.sort === 'distance' && !origin) locate();
              }}
            >
              اعمال فیلترها
            </button>
            <button
              className="text-link"
              onClick={() =>
                setDraft({
                  ...draft,
                  city: '',
                  category: '',
                  amenities: [],
                  online: false,
                  discount: false,
                  sort: 'recommended',
                })
              }
            >
              حذف همه
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
  if (favorites && !data?.user)
    return (
      <>
        <PageTitle title="کافه‌های دوست‌داشتنی من" />
        <LoginGate>
          <span />
        </LoginGate>
      </>
    );
  if (!mapView)
    return (
      <div className="cafe-directory">
        <PageTitle
          title={favorites ? 'کافه‌های دوست‌داشتنی من' : listOnly ? 'منوی کافه‌ها' : 'کافه‌ها'}
          description="کافه را انتخاب کن؛ منو، رزرو و پرداخت حضوری در صفحه کافه است."
        />
        <div className="directory-controls">{controls}</div>
        {locationError && (
          <p className="notice" role="status">
            {locationError}
          </p>
        )}
        {directoryNotice && (
          <p className="notice" role="status">
            {directoryNotice}
          </p>
        )}
        <div className="results-meta">
          <strong>{digits(cafes.length)} کافه</strong>
          <span>{cafeSortLabels[filters.sort]}</span>
        </div>
        <div className="cafe-directory-list">
          {cafes.slice(0, visibleCount).map((cafe) => (
            <CafeCard key={cafe.id} cafe={cafe} origin={origin} />
          ))}
        </div>
        {cafes.length > visibleCount && (
          <button
            className="button secondary full"
            onClick={() => setVisibleCount((count) => count + 40)}
          >
            نمایش کافه‌های بیشتر
          </button>
        )}
        {!cafes.length && (
          <Empty
            title="کافه‌ای با این مشخصات پیدا نشد"
            description="جستجو یا فیلترها را تغییر بده."
          />
        )}
        {sheets}
      </div>
    );
  return (
    <div
      ref={page}
      className="cafe-explorer"
      data-drawer={snap}
      style={
        { '--explorer-sheet-height': (dragHeight ?? snaps[snap]) + 'px' } as React.CSSProperties
      }
    >
      <MapCanvas
        className="cafe-explorer-canvas"
        fullscreen
        label="نقشه کافه‌های اطراف من"
        points={mapped}
        selected={selected}
        onSelect={select}
        onMove={setBounds}
        camera={camera}
        origin={origin}
      />
      <header className="explorer-floating-header">
        <div className="explorer-heading">
          <h1>کافه‌های اطراف من</h1>
          <button
            className="icon-button"
            onClick={() => update({}, 'list')}
            aria-label="فهرست کافه‌ها"
          >
            <List size={21} />
          </button>
        </div>
        {controls}
      </header>
      <div className="explorer-map-actions" style={{ bottom: (dragHeight ?? snaps[snap]) + 14 }}>
        <button
          className="icon-button"
          disabled={locating}
          aria-label="موقعیت من"
          aria-busy={locating}
          onClick={locate}
        >
          <LocateFixed size={23} />
        </button>
      </div>
      {locationError && (
        <p className="explorer-location-error" role="status">
          {locationError}
          <button aria-label="بستن پیام موقعیت" onClick={() => setLocationError('')}>
            <X size={16} />
          </button>
        </p>
      )}
      <section
        className={'explorer-drawer' + (dragHeight !== null ? ' dragging' : '')}
        style={{ height: dragHeight ?? snaps[snap] }}
        aria-label="کافه‌های این محدوده"
      >
        <button
          className="explorer-drawer-handle"
          aria-label={snap === 'expanded' ? 'جمع کردن فهرست کافه‌ها' : 'گسترش فهرست کافه‌ها'}
          aria-expanded={snap !== 'collapsed'}
          aria-controls="cafe-map-results"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={() => {
            drag.current = null;
            setDragHeight(null);
            dragged.current = true;
          }}
          onClick={() => {
            if (!dragged.current)
              setSnap((current) => (current === 'expanded' ? 'preview' : 'expanded'));
            dragged.current = false;
          }}
          onKeyDown={(event) => {
            if (['ArrowUp', 'ArrowDown', 'Escape'].includes(event.key)) {
              event.preventDefault();
              setSnap(
                event.key === 'ArrowUp'
                  ? 'expanded'
                  : event.key === 'Escape'
                    ? 'collapsed'
                    : 'preview',
              );
            }
          }}
        >
          <span />
        </button>
        <div className="explorer-results-heading">
          <h2>{active ? 'کافه انتخاب‌شده' : searching ? 'نتایج جستجو' : 'کافه‌ها'}</h2>
          <span role="status">{digits(results.length)} کافه</span>
          {active && (
            <button
              className="icon-button"
              aria-label="بستن اطلاعات کافه"
              onClick={() => setSelected('')}
            >
              <X size={17} />
            </button>
          )}
        </div>
        <div
          id="cafe-map-results"
          className="explorer-results-scroll"
          ref={list}
          hidden={snap === 'collapsed'}
          onScroll={(event) => {
            if (snap === 'preview' && event.currentTarget.scrollTop > 0) setSnap('expanded');
          }}
        >
          {directoryNotice && (
            <p className="explorer-unmapped" role="status">
              {directoryNotice}
            </p>
          )}
          <div className="explorer-result-cards">
            {results.slice(0, visibleCount).map((cafe) => (
              <ExplorerCafeCard
                key={cafe.id}
                cafe={cafe}
                origin={origin}
                selected={active?.id === cafe.id}
              />
            ))}
          </div>
          {results.length > visibleCount && (
            <button
              className="button secondary full"
              onClick={() => setVisibleCount((count) => count + 40)}
            >
              نمایش کافه‌های بیشتر
            </button>
          )}
          {!results.length && (
            <div className="explorer-empty">
              <MapPin size={25} />
              <h3>
                {searching ? 'کافه‌ای با این مشخصات پیدا نشد' : 'کافه‌ای در این محدوده پیدا نشد'}
              </h3>
              <p>
                {searching
                  ? 'نام کافه یا محله دیگری را جستجو کن.'
                  : 'نقشه را حرکت بده یا فیلترها را تغییر بده.'}
              </p>
              <button className="text-link" onClick={() => update({}, 'list')}>
                دیدن فهرست کافه‌ها <ArrowLeft size={16} />
              </button>
            </div>
          )}
          {demo && !searching && !active && (
            <Link className="text-link explorer-demo-link" href={'/reserve?cafe=' + demo.id}>
              آزمایش رزرو میز
            </Link>
          )}
          <VitrinFooter />
        </div>
      </section>
      {sheets}
    </div>
  );
}
