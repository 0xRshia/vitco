'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Heart, MapPin, Star, Plus, Coffee } from 'lucide-react';
import { useApp, api } from '@/lib/client';
import { money, digits, amenities } from '@/lib/format';
import { productCategory } from '@/lib/catalog';
import { distanceKm, hasCoordinates, type GeoPoint } from '@/lib/cafe-discovery';
import type { Cafe, Product } from '@/lib/types';
import { Media } from './ui';

export function FavoriteButton({ id }: { id: string }) {
  const { data, refresh, toast } = useApp();
  const router = useRouter();
  const selected = Boolean(data?.favorites.includes(id));
  return (
    <button
      className={'favorite-button ' + (selected ? 'selected' : '')}
      aria-label={selected ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'}
      aria-pressed={selected}
      onClick={async (event) => {
        event.preventDefault();
        if (!data?.user) {
          router.push('/login?next=' + encodeURIComponent('/cafes/' + id));
          return;
        }
        try {
          await api('favorites/' + id, 'POST', {});
          await refresh();
        } catch (error) {
          toast((error as Error).message);
        }
      }}
    >
      <Heart size={19} fill={selected ? 'currentColor' : 'none'} />
    </button>
  );
}

export function CafeCard({
  cafe,
  origin = null,
  selected = false,
  onSelect,
}: {
  cafe: Cafe;
  origin?: GeoPoint | null;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const { data } = useApp();
  const products = data?.products.filter((p) => p.cafe_id === cafe.id && p.available) || [];
  const price = products.length ? Math.min(...products.map((p) => p.price)) : null;
  const distance = origin && hasCoordinates(cafe) ? distanceKm(origin, cafe) : null;
  const content = (
    <>
      <Media src={cafe.image} alt={cafe.name} kind="store" />
      <span className="cafe-row-copy">
        <h3>{cafe.name}</h3>
        <span className="cafe-row-rating">
          {cafe.rating !== null ? (
            <>
              <Star size={14} fill="currentColor" />
              {digits(cafe.rating.toFixed(1))}
              <small>({digits(cafe.review_count)} نظر)</small>
            </>
          ) : (
            <small>هنوز نظری ثبت نشده</small>
          )}
          {distance !== null && (
            <small>
              · {digits(distance < 1 ? Math.round(distance * 1000) : distance.toFixed(1))}{' '}
              {distance < 1 ? 'متر' : 'کیلومتر'}
            </small>
          )}
        </span>
        <span className="cafe-row-address">
          <MapPin size={13} />
          {[cafe.city, cafe.address].filter(Boolean).join(' · ') || 'آدرس در منبع ثبت نشده'}
        </span>
        <span className="cafe-row-price">
          {price !== null ? 'منو از ' + money(price) : 'منو هنوز ثبت نشده'}
        </span>
      </span>
    </>
  );
  return (
    <article className={'cafe-row' + (selected ? ' selected' : '')}>
      {onSelect ? (
        <button type="button" className="cafe-row-main" aria-pressed={selected} onClick={onSelect}>
          {content}
        </button>
      ) : (
        <Link href={'/cafes/' + cafe.id} className="cafe-row-main">
          {content}
        </Link>
      )}
      <div className="cafe-row-tags">
        {cafe.is_demo && <span>آزمایشی · رزرو واقعی نیست</span>}
        {cafe.directory_source === 'hmghadam' && <span>اطلاعات همقدم · رزرو غیرفعال</span>}
        {cafe.owner_id && cafe.active && cafe.invoice_discount_percent > 0 && (
          <span className="invoice-discount-tag">
            {digits(cafe.invoice_discount_percent)}٪ تخفیف حضوری
          </span>
        )}
        {cafe.amenities.slice(0, 3).map((key) => (
          <span key={key}>{amenities[key] || key}</span>
        ))}
        {!cafe.owner_id && products.length > 0 && <span>مشاهده منو</span>}
      </div>
      {selected && (
        <div className="map-cafe-details">
          <Link className="button primary full" href={'/cafes/' + cafe.id}>
            صفحه کافه <ArrowLeft size={17} />
          </Link>
        </div>
      )}
    </article>
  );
}

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="menu-product-row">
      <Link className="menu-product-image" href={'/products/' + product.id}>
        <Media src={product.image} alt={product.name} />
      </Link>
      <div className="menu-product-copy">
        <small>{product.cafe_name || productCategory(product.category)}</small>
        <Link href={'/products/' + product.id}>
          <h3>{product.name}</h3>
        </Link>
        <p>{product.description}</p>
        <strong>{money(product.price)}</strong>
      </div>
      <Link
        className="menu-product-add"
        href={'/products/' + product.id}
        aria-label={'مشاهده ' + product.name}
      >
        {product.available ? <Plus size={20} /> : <Coffee size={19} />}
      </Link>
    </article>
  );
}
