import { readFile } from 'node:fs/promises';
import { one, run, transaction } from './database';
import type { Bootstrap } from './types';

const origin = 'https://data.hmghadam.com';
const source = 'hmghadam';
const refreshMs = 15 * 60 * 1000;
const retryMs = 60 * 1000;
const maxBytes = 100 * 1024 * 1024;
const amenityTags: Record<string, string> = {
  outdoor_space_available: 'outdoor',
  smoke_allowed: 'smoking',
  good_for_work_or_study: 'work',
};
type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid directory record');
  return value as RecordValue;
}
function string(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
function httpUrl(value: unknown) {
  try {
    const url = new URL(string(value));
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : '';
  } catch {
    return '';
  }
}

/** The deployed crawler's Store export, not its paginated StoreCard (which lacks coordinates). */
export function parseCafeDirectory(value: unknown) {
  if (!Array.isArray(value) || !value.length) throw new Error('Empty or invalid venue export');
  const ids = new Set<string>();
  const cafes = value.flatMap((item) => {
    const store = record(item);
    if (!Array.isArray(store.categories) || !Array.isArray(store.photos))
      throw new Error('Invalid venue export schema');
    if (!store.categories.includes('cafe')) return [];
    const placeId = string(store.place_id),
      name = string(store.name);
    const sourceUrl = httpUrl(store.source_url);
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(placeId) || !name || !sourceUrl || ids.has(placeId))
      throw new Error('Invalid or duplicate café identity');
    ids.add(placeId);
    const tags = Array.isArray(store.tags) ? store.tags.map(record) : [];
    const images = [
      ...new Set(
        store.photos
          .map(record)
          .filter((photo) => photo.kind === 'venue')
          .map((photo) => httpUrl(photo.url))
          .filter(Boolean),
      ),
    ];
    const coordinates =
      typeof store.latitude === 'number' &&
      Number.isFinite(store.latitude) &&
      Math.abs(store.latitude) <= 90 &&
      typeof store.longitude === 'number' &&
      Number.isFinite(store.longitude) &&
      Math.abs(store.longitude) <= 180;
    return [
      {
        id: 'invara-' + placeId,
        name,
        description: tags
          .map((tag) => string(tag.label_fa))
          .filter(Boolean)
          .join('، '),
        address: string(store.address),
        latitude: coordinates ? (store.latitude as number) : null,
        longitude: coordinates ? (store.longitude as number) : null,
        image: httpUrl(store.cover_image_url) || images[0] || '',
        images,
        amenities: [...new Set(tags.map((tag) => amenityTags[string(tag.code)]).filter(Boolean))],
        source: sourceUrl,
        external_menu_url: httpUrl(store.menu_url),
      },
    ];
  });
  if (!cafes.length) throw new Error('No cafés in venue export');
  return cafes;
}

export function importCafeDirectory(value: unknown, now?: Date) {
  // Validate the entire document before touching the last successful import.
  const cafes = parseCafeDirectory(value);
  transaction(() => {
    for (const cafe of cafes) {
      run(
        `INSERT INTO cafes (id,name,description,city,address,phone,latitude,longitude,image,images,amenities,
        opens,closes,capacity,pickup,active,source,directory_source,external_menu_url)
        VALUES (?,?,?,'',?,'',?,?,?,?,?,'','',0,0,0,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,
        address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude,
        image=excluded.image,images=excluded.images,amenities=excluded.amenities,
        source=excluded.source,external_menu_url=excluded.external_menu_url
        WHERE cafes.owner_id IS NULL AND cafes.directory_source=?`,
        cafe.id,
        cafe.name,
        cafe.description,
        cafe.address,
        cafe.latitude,
        cafe.longitude,
        cafe.image,
        JSON.stringify(cafe.images),
        JSON.stringify(cafe.amenities),
        cafe.source,
        source,
        cafe.external_menu_url,
        source,
      );
    }
    run(
      `INSERT INTO cafe_directory_sync (source,synced_at,cafe_count) VALUES (?,?,?)
      ON CONFLICT(source) DO UPDATE SET synced_at=excluded.synced_at,cafe_count=excluded.cafe_count`,
      source,
      (now ?? new Date(Date.now())).toISOString(),
      cafes.length,
    );
  });
  return cafes.length;
}

type SyncState = { synced_at: string; cafe_count: number };
type DirectoryStatus = NonNullable<Bootstrap['directory']>;
let pending: Promise<DirectoryStatus> | null = null;
let retryAt = 0;
function configured() {
  return Boolean(
    process.env.CAFE_DIRECTORY_FILE ||
    process.env.CAFE_DIRECTORY_USERNAME ||
    process.env.CAFE_DIRECTORY_PASSWORD,
  );
}
async function responseJson(response: Response) {
  if (!response.ok) throw new Error('Directory request failed');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Directory response missing');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) throw new Error('Directory response too large');
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
async function fetchDirectory(transport: typeof fetch) {
  if (process.env.CAFE_DIRECTORY_FILE) {
    const bytes = await readFile(/* turbopackIgnore: true */ process.env.CAFE_DIRECTORY_FILE);
    if (bytes.length > maxBytes) throw new Error('Directory file too large');
    return JSON.parse(bytes.toString('utf8')) as unknown;
  }
  const username = process.env.CAFE_DIRECTORY_USERNAME,
    password = process.env.CAFE_DIRECTORY_PASSWORD;
  if (!username || !password) throw new Error('Incomplete directory credentials');
  const signal = AbortSignal.timeout(45000);
  const login = await transport(origin + '/api/admin/login', {
    method: 'POST',
    redirect: 'error',
    cache: 'no-store',
    signal,
    headers: {
      Origin: origin,
      'X-Requested-With': 'crawler-panel',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  if (!login.ok || !cookie?.startsWith('hg_crawler_session='))
    throw new Error('Directory authentication failed');
  await login.body?.cancel();
  try {
    return await responseJson(
      await transport(origin + '/download/stores.json', {
        headers: { Cookie: cookie },
        redirect: 'error',
        cache: 'no-store',
        signal,
      }),
    );
  } finally {
    // Sessions are short-lived and never persisted in Vitco or exposed to its clients.
    await transport(origin + '/api/admin/logout', {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
      headers: { Cookie: cookie, Origin: origin, 'X-Requested-With': 'crawler-panel' },
    })
      .then((r) => r.body?.cancel())
      .catch(() => {});
  }
}
export function directoryStatus(): DirectoryStatus {
  const state = one<SyncState>(
    'SELECT synced_at,cafe_count FROM cafe_directory_sync WHERE source=?',
    source,
  );
  const enabled = configured();
  const now = Date.now();
  const status: DirectoryStatus = {
    configured: enabled,
    status: state ? 'stale' : 'unavailable',
    synced_at: state?.synced_at || null,
    cafe_count: state?.cafe_count || 0,
    refresh_after_ms: 0,
  };
  if (!enabled) {
    if (!state) status.status = 'disabled';
  } else if (pending) {
    status.status = 'refreshing';
  } else if (retryAt) {
    status.refresh_after_ms = Math.max(0, retryAt - now);
  } else if (state) {
    status.refresh_after_ms = Math.max(0, Date.parse(state.synced_at) + refreshMs - now);
    if (status.refresh_after_ms > 0) status.status = 'ready';
  }
  return status;
}
export async function syncCafeDirectory(
  transport: typeof fetch = fetch,
  waitForRefresh = false,
): Promise<DirectoryStatus> {
  if (waitForRefresh && pending) return pending;
  const state = directoryStatus();
  if (!state.configured || state.refresh_after_ms > 0) return state;
  if (!pending) {
    pending = (async () => {
      try {
        importCafeDirectory(await fetchDirectory(transport));
        retryAt = 0;
      } catch {
        retryAt = Date.now() + retryMs;
      } finally {
        pending = null;
      }
      return directoryStatus();
    })();
  }
  // A saved catalogue is served immediately while its refresh runs in the background.
  if (!state.synced_at || waitForRefresh) return pending;
  return { ...state, status: 'refreshing' };
}
