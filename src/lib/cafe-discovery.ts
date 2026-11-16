import type { Cafe, Product } from './types';
import { productCategory } from './catalog';

export type GeoPoint = { latitude: number; longitude: number };
export type CafeSort = 'recommended' | 'rating' | 'distance' | 'price' | 'name';
export type CafeFilters = {
  search: string;
  city: string;
  category: string;
  amenities: string[];
  online: boolean;
  discount: boolean;
  sort: CafeSort;
};
export const cafeSortLabels: Record<CafeSort, string> = {
  recommended: 'پیشنهادی',
  rating: 'بالاترین امتیاز',
  distance: 'نزدیک‌ترین',
  price: 'کمترین قیمت منو',
  name: 'نام کافه',
};
export const normalizeSearch = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\u200d]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('fa');
export function hasCoordinates(value: {
  latitude: number | null;
  longitude: number | null;
}): value is GeoPoint {
  return (
    value.latitude !== null &&
    value.longitude !== null &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.latitude) <= 90 &&
    Math.abs(value.longitude) <= 180
  );
}
export function distanceKm(a: GeoPoint, b: GeoPoint) {
  const rad = Math.PI / 180;
  const x =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}
// Screen-space grouping follows the neighboring Ham-Ghadam map. Pins separate
// naturally as the camera zooms; co-located cafés also remain in the result list.
export function clusterCafes<T extends GeoPoint>(
  points: T[],
  project: (point: T) => { x: number; y: number },
  radius = 90,
) {
  const groups: { anchor: { x: number; y: number }; items: T[] }[] = [];
  const cells = new Map<string, number[]>();
  for (const point of points) {
    const pixel = project(point),
      x = Math.floor(pixel.x / radius),
      y = Math.floor(pixel.y / radius);
    let index: number | undefined;
    for (let dx = -1; dx <= 1 && index === undefined; dx++)
      for (let dy = -1; dy <= 1 && index === undefined; dy++)
        index = cells
          .get(`${x + dx}:${y + dy}`)
          ?.find(
            (i) => Math.hypot(groups[i].anchor.x - pixel.x, groups[i].anchor.y - pixel.y) < radius,
          );
    if (index === undefined) {
      index = groups.length;
      groups.push({ anchor: pixel, items: [] });
      const key = `${x}:${y}`,
        bucket = cells.get(key) || [];
      bucket.push(index);
      cells.set(key, bucket);
    }
    groups[index].items.push(point);
  }
  return groups.map(({ items }) => ({
    items,
    latitude: items.reduce((sum, item) => sum + item.latitude, 0) / items.length,
    longitude: items.reduce((sum, item) => sum + item.longitude, 0) / items.length,
  }));
}
export function discoverCafes(
  cafes: Cafe[],
  products: Product[],
  filters: CafeFilters,
  origin: GeoPoint | null,
) {
  const search = normalizeSearch(filters.search);
  const byCafe = new Map<string, Product[]>();
  for (const product of products) {
    if (!product.available) continue;
    const list = byCafe.get(product.cafe_id) || [];
    list.push(product);
    byCafe.set(product.cafe_id, list);
  }
  const minimum = (cafe: Cafe) => {
    const prices = (byCafe.get(cafe.id) || []).map((p) => p.price);
    return prices.length ? Math.min(...prices) : Infinity;
  };
  const distance = (cafe: Cafe) =>
    origin && hasCoordinates(cafe) ? distanceKm(origin, cafe) : Infinity;
  return cafes
    .filter(
      (cafe) =>
        (!search ||
          normalizeSearch(
            [cafe.name, cafe.city, cafe.address, cafe.description].join(' '),
          ).includes(search)) &&
        (!filters.city || cafe.city === filters.city) &&
        (!filters.category ||
          byCafe.get(cafe.id)?.some((p) => productCategory(p.category) === filters.category)) &&
        filters.amenities.every((amenity) => cafe.amenities.includes(amenity)) &&
        (!filters.online || Boolean(cafe.active && cafe.owner_id)) &&
        (!filters.discount ||
          Boolean(cafe.active && cafe.owner_id && cafe.invoice_discount_percent > 0)),
    )
    .sort((a, b) => {
      const name = a.name.localeCompare(b.name, 'fa');
      switch (filters.sort) {
        case 'rating':
          return (b.rating ?? -1) - (a.rating ?? -1) || b.review_count - a.review_count || name;
        case 'distance':
          return distance(a) - distance(b) || name;
        case 'price':
          return minimum(a) - minimum(b) || name;
        case 'name':
          return name;
        default:
          return (
            Number(Boolean(b.active && b.owner_id)) - Number(Boolean(a.active && a.owner_id)) ||
            name
          );
      }
    });
}
