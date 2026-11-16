import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  discoverCafes,
  distanceKm,
  hasCoordinates,
  normalizeSearch,
  clusterCafes,
  type CafeFilters,
} from '../src/lib/cafe-discovery';
import type { Cafe, Product } from '../src/lib/types';

const base: Cafe = {
  id: 'a',
  owner_id: 'owner',
  name: 'کافه آبی',
  description: '',
  city: 'تهران',
  address: 'خیابان کارگر',
  phone: '',
  image: '',
  images: [],
  tables: [],
  amenities: ['wifi'],
  latitude: 35.7,
  longitude: 51.4,
  opens: '08:00',
  closes: '22:00',
  capacity: 10,
  delivery: false,
  pickup: true,
  delivery_fee: 0,
  invoice_discount_percent: 20,
  active: true,
  source: '',
  rating: 4,
  review_count: 2,
};
const cafes = [
  base,
  {
    ...base,
    id: 'b',
    name: 'کافه سبز',
    latitude: 35.71,
    invoice_discount_percent: 0,
    rating: 5,
    amenities: ['outdoor'],
    city: 'شیراز',
  },
  {
    ...base,
    id: 'c',
    name: 'کافه بی‌موقعیت',
    latitude: null,
    longitude: null,
    rating: null,
    active: false,
    owner_id: null,
  },
];
const products: Product[] = [
  {
    id: 'coffee',
    cafe_id: 'a',
    name: 'قهوه',
    description: '',
    category: 'قهوه',
    price: 100000,
    image: '',
    available: true,
    sizes: [],
    addons: [],
    max_addons: 0,
    source: '',
  },
  {
    id: 'burger',
    cafe_id: 'b',
    name: 'برگر',
    description: '',
    category: 'برگر',
    price: 200000,
    image: '',
    available: true,
    sizes: [],
    addons: [],
    max_addons: 0,
    source: '',
  },
];
const defaults: CafeFilters = {
  search: '',
  city: '',
  category: '',
  amenities: [],
  online: false,
  discount: false,
  sort: 'recommended',
};
const ids = (patch: Partial<CafeFilters>, origin = { latitude: 35.7, longitude: 51.4 }) =>
  discoverCafes(cafes, products, { ...defaults, ...patch }, origin).map((c) => c.id);
test('café search normalizes Arabic letters and applies city, menu, amenities and actual discounts together', () => {
  assert.equal(normalizeSearch(' كافه\u200cي من '), 'کافه ی من');
  assert.deepEqual(
    ids({
      search: 'كافه آبی',
      city: 'تهران',
      category: 'قهوه',
      amenities: ['wifi'],
      discount: true,
    }),
    ['a'],
  );
  assert.deepEqual(ids({ city: 'شیراز', category: 'قهوه' }), []);
  assert.deepEqual(ids({ amenities: ['wifi', 'outdoor'] }), []);
  assert.deepEqual(ids({ online: true }).sort(), ['a', 'b']);
  assert.deepEqual(ids({ discount: true }), ['a']);
});
test('map clusters separate with screen zoom and preserve every café at coincident positions', () => {
  const points = [
    { id: 'one', latitude: 0, longitude: 0 },
    { id: 'two', latitude: 0, longitude: 0.1 },
    { id: 'three', latitude: 0, longitude: 2 },
  ];
  const zoomedOut = clusterCafes(points, (point) => ({ x: point.longitude * 100, y: 0 }), 48);
  assert.deepEqual(
    zoomedOut.map((group) => group.items.map((item) => item.id)),
    [['one', 'two'], ['three']],
  );
  assert.equal(zoomedOut[0].longitude, 0.05);
  assert.equal(
    clusterCafes(points, (point) => ({ x: point.longitude * 1000, y: 0 }), 48).length,
    3,
  );
  const samePlace = clusterCafes(points, () => ({ x: 0, y: 0 }));
  assert.equal(samePlace[0].items.length, 3);
});
test('ratings, real minimum menu price and distance sort deterministically, with unknown data last', () => {
  assert.deepEqual(ids({ sort: 'rating' }), ['b', 'a', 'c']);
  assert.deepEqual(ids({ sort: 'price' }), ['a', 'b', 'c']);
  assert.deepEqual(ids({ sort: 'distance' }), ['a', 'b', 'c']);
  assert.equal(hasCoordinates(cafes[2]), false);
  assert.equal(hasCoordinates({ latitude: 91, longitude: 0 }), false);
  assert.ok(
    distanceKm(base as Cafe & { latitude: number; longitude: number }, {
      latitude: 35.71,
      longitude: 51.4,
    }) > 1,
  );
  assert.equal(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }), 0);
  const saved = cafes.map((c) => c.id);
  ids({ sort: 'rating' });
  assert.deepEqual(
    cafes.map((c) => c.id),
    saved,
  );
});
