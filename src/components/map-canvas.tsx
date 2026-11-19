'use client';
import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useApp } from '@/lib/client';
import { digits } from '@/lib/format';
import { clusterCafes, type GeoPoint } from '@/lib/cafe-discovery';

export type MapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
  center: GeoPoint;
};
export type MapCamera = { points: GeoPoint[]; zoom?: number; revision: string | number };
export type MapPoint = GeoPoint & { id: string; name: string; image?: string };
type Runtime = {
  map: MapLibreMap;
  sdk: Pick<typeof import('maplibre-gl'), 'Marker' | 'LngLatBounds'>;
  active: boolean;
};
const emptyPoints: MapPoint[] = [];
const mobileMapQuery = '(max-width: 760px)';
const styles = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  streets: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
export const mapCredits = [
  { label: 'OpenFreeMap', url: 'https://openfreemap.org/' },
  { label: '© OpenMapTiles', url: 'https://www.openmaptiles.org/' },
  { label: '© OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' },
];
function attribution() {
  let element: HTMLDivElement | undefined;
  return {
    onAdd() {
      element = document.createElement('div');
      element.className = 'maplibregl-ctrl map-source-credit';
      element.dir = 'ltr';
      element.setAttribute('aria-label', 'منابع نقشه');
      for (const [index, credit] of mapCredits.entries()) {
        if (index) element.append(' · ');
        const link = document.createElement('a');
        link.href = credit.url;
        link.textContent = credit.label;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        element.append(link);
      }
      return element;
    },
    onRemove() {
      element?.remove();
      element = undefined;
    },
  };
}
export function MapCanvas({
  points = emptyPoints,
  selected = '',
  onSelect,
  onMove,
  camera = null,
  origin = null,
  onChange,
  label = 'نقشه کافه‌ها',
  fullscreen = false,
  fitInitialResults = false,
  className = '',
}: {
  points?: MapPoint[];
  selected?: string;
  onSelect?: (id: string) => void;
  onMove?: (bounds: MapBounds) => void;
  camera?: MapCamera | null;
  origin?: GeoPoint | null;
  onChange?: (point: GeoPoint) => void;
  label?: string;
  fullscreen?: boolean;
  fitInitialResults?: boolean;
  className?: string;
}) {
  const { theme } = useApp();
  const lightStyle = fullscreen ? styles.streets : styles.light;
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onSelect, onMove, onChange });
  callbacks.current = { onSelect, onMove, onChange };
  const dark = useRef(theme === 'dark');
  dark.current = theme === 'dark';
  const appliedStyle = useRef(''),
    appliedCamera = useRef<string | number | undefined>(undefined);
  const markerFocus = useRef<string | undefined>(undefined);
  const [runtime, setRuntime] = useState<Runtime | null>(null),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const editable = Boolean(onChange);
  useEffect(() => {
    let active = true,
      instance: Runtime | undefined,
      observer: ResizeObserver | undefined;
    setReady(false);
    setFailed(false);
    appliedCamera.current = undefined;
    void import('@/lib/maplibre-client')
      .then(({ default: sdk }) => {
        if (!active || !host.current) return;
        const style = dark.current ? styles.dark : lightStyle;
        const map = new sdk.Map({
          container: host.current,
          style,
          center: fullscreen ? [51.389, 35.6892] : [53.7, 32.4],
          // MapLibre's 512px tiles show the reference's mobile street scale at zoom 13.
          zoom: fullscreen ? (window.matchMedia(mobileMapQuery).matches ? 13 : 14) : 4,
          maxZoom: 18,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          locale: {
            'Map.Title': 'جابه‌جایی نقشه با کلیدهای جهت‌دار',
            'NavigationControl.ZoomIn': 'بزرگ‌نمایی',
            'NavigationControl.ZoomOut': 'کوچک‌نمایی',
          },
        });
        map.touchZoomRotate.disableRotation();
        map.addControl(attribution(), 'bottom-left');
        map.addControl(new sdk.NavigationControl({ showCompass: false }), 'top-left');
        appliedStyle.current = style;
        const created: Runtime = { map, sdk, active: true };
        instance = created;
        const reportBounds = () => {
          const b = map.getBounds(),
            center = map.getCenter().wrap();
          callbacks.current.onMove?.({
            north: b.getNorth(),
            south: b.getSouth(),
            east: b.getEast(),
            west: b.getWest(),
            center: { latitude: center.lat, longitude: center.lng },
          });
        };
        map.on('moveend', reportBounds);
        if (fullscreen) reportBounds();
        map.on('click', (event) => {
          if (editable) {
            const point = event.lngLat.wrap();
            callbacks.current.onChange?.({ latitude: point.lat, longitude: point.lng });
          }
        });
        map.on('style.load', () => {
          for (const layer of map.getStyle().layers) {
            if (
              !fullscreen &&
              layer.type === 'symbol' &&
              (/shield/i.test(layer.id) || layer.id === 'highway_name_motorway')
            )
              map.setLayoutProperty(layer.id, 'visibility', 'none');
            if (dark.current) {
              if (layer.type === 'background')
                map.setPaintProperty(layer.id, 'background-color', '#1f2937');
              else if (layer.type === 'fill') {
                map.setPaintProperty(
                  layer.id,
                  'fill-color',
                  layer.id === 'water'
                    ? '#172334'
                    : /park|wood/.test(layer.id)
                      ? '#23353b'
                      : '#202c3b',
                );
                if (layer.id === 'building')
                  map.setPaintProperty(layer.id, 'fill-outline-color', '#2d3b4f');
              } else if (layer.type === 'line') {
                map.setPaintProperty(
                  layer.id,
                  'line-color',
                  /water/.test(layer.id)
                    ? '#172334'
                    : /casing|boundary/.test(layer.id)
                      ? '#40506a'
                      : '#303e52',
                );
              } else if (layer.type === 'symbol' && layer.layout?.['text-field']) {
                map.setPaintProperty(layer.id, 'text-color', '#9aa6b6');
                map.setPaintProperty(layer.id, 'text-halo-color', '#1f2937');
              }
            }
          }
        });
        map.on('error', () => {
          if (active) setFailed(true);
        });
        map.on('idle', () => {
          if (active && map.areTilesLoaded()) {
            setFailed(false);
            setReady(true);
          }
        });
        observer = new ResizeObserver(() => {
          if (active) map.resize();
        });
        observer.observe(host.current);
        setRuntime(created);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      observer?.disconnect();
      if (instance) {
        instance.active = false;
        instance.map.remove();
      }
    };
  }, [attempt, editable, label, fullscreen, lightStyle]);
  useEffect(() => {
    const next = theme === 'dark' ? styles.dark : lightStyle;
    if (runtime?.active && next !== appliedStyle.current) {
      appliedStyle.current = next;
      runtime.map.setStyle(next);
    }
  }, [runtime, theme, lightStyle]);
  useEffect(() => {
    if (!runtime?.active) return;
    const { map, sdk } = runtime;
    const mobile = window.matchMedia(mobileMapQuery);
    let markers: Marker[] = [];
    const render = () => {
      const focused =
        (document.activeElement instanceof HTMLElement
          ? document.activeElement.dataset.cafeId
          : undefined) || markerFocus.current;
      markerFocus.current = undefined;
      markers.forEach((marker) => marker.remove());
      markers = [];
      const groups = fullscreen
        ? clusterCafes(
            points.filter((point) => map.getBounds().contains([point.longitude, point.latitude])),
            (point) => map.project([point.longitude, point.latitude]),
          )
        : points.map((point) => ({ ...point, items: [point] }));
      for (const group of groups) {
        const point = group.items.find((point) => point.id === selected) || group.items[0];
        if (editable || !fullscreen) {
          const marker = new sdk.Marker({
            color: point.id === selected || editable ? '#935426' : '#333336',
            draggable: editable,
          })
            .setLngLat([point.longitude, point.latitude])
            .addTo(map);
          marker.getElement().setAttribute('aria-label', point.name);
          if (editable)
            marker.on('dragend', () => {
              const next = marker.getLngLat().wrap();
              callbacks.current.onChange?.({ latitude: next.lat, longitude: next.lng });
            });
          else
            marker
              .getElement()
              .addEventListener('click', () => callbacks.current.onSelect?.(point.id));
          markers.push(marker);
          continue;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.cafeId = point.id;
        const clustered = group.items.length > 1 && point.id !== selected;
        const pin = mobile.matches && !clustered;
        button.className =
          'cafe-map-marker' + (point.id === selected ? ' selected' : clustered ? ' clustered' : '');
        if (pin) button.classList.add('pin');
        button.setAttribute(
          'aria-label',
          clustered ? digits(group.items.length) + ' کافه؛ بزرگ‌نمایی' : point.name,
        );
        button.setAttribute('aria-pressed', String(point.id === selected));
        if (point.image && !clustered && !pin) {
          const image = document.createElement('img');
          image.src = point.image;
          image.alt = '';
          button.append(image);
        }
        if (!clustered && !pin) {
          const text = document.createElement('span');
          text.textContent = point.name;
          button.append(text);
        }
        if (group.items.length > 1 && !pin) {
          const count = document.createElement('b');
          count.textContent = digits(group.items.length);
          button.append(count);
        }
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          if (clustered && map.getZoom() < 18) {
            map.jumpTo({
              center: [group.longitude, group.latitude],
              zoom: Math.min(18, map.getZoom() + 3),
            });
            return;
          }
          callbacks.current.onSelect?.(point.id);
        });
        const position = pin ? point : group;
        markers.push(
          new sdk.Marker({ element: button, anchor: pin ? 'bottom' : 'center' })
            .setLngLat([position.longitude, position.latitude])
            .addTo(map),
        );
        if (focused === point.id) button.focus({ preventScroll: true });
      }
    };
    render();
    map.on('moveend', render);
    if (fullscreen) mobile.addEventListener('change', render);
    let location: Marker | undefined;
    if (origin) {
      const dot = document.createElement('span');
      dot.className = 'map-user-position';
      dot.setAttribute('aria-label', 'موقعیت شما');
      location = new sdk.Marker({ element: dot })
        .setLngLat([origin.longitude, origin.latitude])
        .addTo(map);
    }
    return () => {
      if (document.activeElement instanceof HTMLElement)
        markerFocus.current = document.activeElement.dataset.cafeId;
      map.off('moveend', render);
      if (fullscreen) mobile.removeEventListener('change', render);
      markers.forEach((marker) => marker.remove());
      location?.remove();
    };
  }, [runtime, points, selected, origin, editable, fullscreen]);
  useEffect(() => {
    if (!runtime?.active) return;
    const revision = camera?.revision ?? 'initial';
    if (appliedCamera.current === revision) return;
    const mobileSheet = fullscreen && window.matchMedia(mobileMapQuery).matches;
    if (mobileSheet && !camera && !fitInitialResults) {
      appliedCamera.current = revision;
      return;
    }
    const focus = camera?.points || points;
    if (!focus.length) return;
    appliedCamera.current = revision;
    const { map, sdk } = runtime;
    if (camera?.zoom !== undefined)
      map.jumpTo({
        center: [focus[0].longitude, focus[0].latitude],
        zoom: editable ? Math.max(map.getZoom(), camera.zoom) : camera.zoom,
      });
    else {
      const bounds = new sdk.LngLatBounds(
        [focus[0].longitude, focus[0].latitude],
        [focus[0].longitude, focus[0].latitude],
      );
      focus.forEach((point) => bounds.extend([point.longitude, point.latitude]));
      const width = host.current!.clientWidth,
        height = host.current!.clientHeight;
      const pad = mobileSheet
        ? {
            top: 76,
            bottom: height * 0.2 + 100,
            left: 30,
            right: 30,
          }
        : { top: 30, bottom: 30, left: 30, right: 30 };
      const x = Math.min(1, Math.max(0, width - 120) / Math.max(1, pad.left + pad.right));
      const y = Math.min(1, Math.max(0, height - 64) / Math.max(1, pad.top + pad.bottom));
      map.fitBounds(bounds, {
        padding: {
          top: pad.top * y,
          bottom: pad.bottom * y,
          left: pad.left * x,
          right: pad.right * x,
        },
        maxZoom: 15,
        duration: 0,
      });
    }
  }, [runtime, camera, points, fullscreen, fitInitialResults]);
  useEffect(() => {
    if (!runtime?.active || !fullscreen) return;
    const point = points.find((point) => point.id === selected);
    if (!point) return;
    runtime.map.easeTo({
      center: [point.longitude, point.latitude],
      zoom: Math.max(15, runtime.map.getZoom()),
      offset: [
        0,
        host.current!.clientHeight <= 500 ? 0 : -Math.min(100, host.current!.clientHeight * 0.12),
      ],
      duration: 0,
    });
  }, [runtime, selected, fullscreen]);
  return (
    <div className={'vector-map-shell ' + className} data-map-ready={ready && !failed}>
      <div ref={host} className="vector-map-canvas" role="region" aria-label={label} dir="ltr" />
      {!ready && !failed && (
        <p className="vector-map-message" role="status">
          در حال دریافت نقشه…
        </p>
      )}
      {failed && (
        <p className="vector-map-message map-failed" role="status">
          نقشه دریافت نشد؛ اتصال اینترنت یا پشتیبانی مرورگر از نقشه را بررسی کنید.
          <button className="text-link" onClick={() => setAttempt((value) => value + 1)}>
            تلاش دوباره
          </button>
        </p>
      )}
      {editable && runtime?.active && (
        <button
          className="button secondary map-center-button"
          type="button"
          onClick={() => {
            const point = runtime.map.getCenter().wrap();
            onChange?.({ latitude: point.lat, longitude: point.lng });
          }}
        >
          انتخاب مرکز نقشه
        </button>
      )}
    </div>
  );
}
