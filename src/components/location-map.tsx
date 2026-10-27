'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import Link from 'next/link';
import type { Cafe } from '@/lib/types';
import { digits } from '@/lib/format';

export type Position = { latitude: number; longitude: number };
type MapPoint = Position & { id: string; name: string };
export function hasPosition(value: {
  latitude: number | null;
  longitude: number | null;
}): value is Position {
  return (
    value.latitude !== null &&
    value.longitude !== null &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.latitude) <= 90 &&
    Math.abs(value.longitude) <= 180
  );
}

export function LocationMap({
  points = [],
  selected,
  onSelect,
  value,
  onChange,
  label = 'نقشه کافه‌ها',
}: {
  points?: MapPoint[];
  selected?: string;
  onSelect?: (id: string) => void;
  value?: Position | null;
  onChange?: (position: Position) => void;
  label?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const callbacks = useRef({ onSelect, onChange });
  callbacks.current = { onSelect, onChange };
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tileFailed, setTileFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const serialized = JSON.stringify(
    points
      .filter(hasPosition)
      .map(({ id, name, latitude, longitude }) => ({ id, name, latitude, longitude })),
  );
  const latitude = value?.latitude,
    longitude = value?.longitude;
  const editable = Boolean(onChange);

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    setFailed(false);
    setTileFailed(false);
    void import('leaflet')
      .then((L) => {
        if (disposed || !host.current) return;
        const instance = L.map(host.current, {
          scrollWheelZoom: false,
          zoomControl: false,
        }).setView([32.4, 53.7], 5);
        L.control.zoom({ zoomInTitle: 'بزرگ‌نمایی', zoomOutTitle: 'کوچک‌نمایی' }).addTo(instance);
        map.current = instance;
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        })
          .on('tileerror', () => {
            if (!disposed) setTileFailed(true);
          })
          .addTo(instance);
        instance.on('click', (event: L.LeafletMouseEvent) => {
          const position = event.latlng.wrap();
          callbacks.current.onChange?.({ latitude: position.lat, longitude: position.lng });
        });
        observer = new ResizeObserver(() => instance.invalidateSize());
        observer.observe(host.current);
        setReady(true);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      observer?.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    if (!ready || !map.current) return;
    const instance = map.current;
    let disposed = false;
    let group: import('leaflet').LayerGroup | undefined;
    void import('leaflet').then((L) => {
      if (disposed) return;
      group = L.layerGroup().addTo(instance);
      const locations: MapPoint[] = JSON.parse(serialized);
      if (latitude !== undefined && longitude !== undefined)
        locations.push({ id: 'address', name: 'موقعیت انتخاب‌شده', latitude, longitude });
      locations.forEach((point) => {
        const marker = L.marker([point.latitude, point.longitude], {
          title: point.name,
          alt: point.name,
          draggable: editable,
          icon: L.divIcon({
            className: 'vitco-map-pin' + (point.id === selected || editable ? ' is-selected' : ''),
            html: '<span aria-hidden="true"></span>',
            iconSize: [32, 40],
            iconAnchor: [16, 40],
          }),
        }).addTo(group!);
        const tooltip = document.createElement('span');
        tooltip.textContent = point.name;
        marker.bindTooltip(tooltip, { direction: 'top', offset: [0, -34] });
        marker.on('click', () => callbacks.current.onSelect?.(point.id));
        marker.on('dragend', () => {
          const position = marker.getLatLng().wrap();
          callbacks.current.onChange?.({ latitude: position.lat, longitude: position.lng });
        });
      });
      const focus =
        locations.find((p) => p.id === selected) || (editable ? locations[0] : undefined);
      if (focus)
        instance.setView([focus.latitude, focus.longitude], Math.max(instance.getZoom(), 15));
      else if (locations.length)
        instance.fitBounds(L.latLngBounds(locations.map((p) => [p.latitude, p.longitude])), {
          padding: [40, 40],
          maxZoom: 15,
        });
    });
    return () => {
      disposed = true;
      group?.remove();
    };
  }, [ready, serialized, selected, latitude, longitude, editable, attempt]);

  return (
    <div className="location-map-shell">
      <div ref={host} className="location-map" role="region" aria-label={label} />
      {!ready && !failed && (
        <p className="map-message" role="status">
          در حال آماده‌سازی نقشه…
        </p>
      )}
      {(failed || tileFailed) && (
        <div className="map-warning" role="status">
          {failed ? 'نقشه بارگذاری نشد.' : 'بخشی از نقشه دریافت نشد؛ اتصال اینترنت را بررسی کنید.'}
          <button
            type="button"
            className="text-link"
            onClick={() => {
              setReady(false);
              setAttempt((n) => n + 1);
            }}
          >
            تلاش دوباره
          </button>
        </div>
      )}
      {editable && ready && (
        <button
          type="button"
          className="button secondary map-center-button"
          onClick={() => {
            const center = map.current?.getCenter().wrap();
            if (center) onChange?.({ latitude: center.lat, longitude: center.lng });
          }}
        >
          انتخاب مرکز نقشه
        </button>
      )}
    </div>
  );
}

export function LocationPicker({
  value,
  onChange,
}: {
  value: Position | null;
  onChange: (value: Position | null) => void;
}) {
  return (
    <section className="location-picker" aria-label="انتخاب موقعیت">
      <p className="muted">
        روی محل دقیق بزنید یا نشانگر را جابه‌جا کنید. با صفحه‌کلید، نقشه را حرکت دهید و «انتخاب مرکز
        نقشه» را بزنید.
      </p>
      <LocationMap value={value} onChange={onChange} label="انتخاب موقعیت روی نقشه" />
      <div className="location-selection" aria-live="polite">
        <span>{value ? 'موقعیت انتخاب شد' : 'هنوز موقعیتی انتخاب نشده'}</span>
        {value && (
          <>
            <small dir="ltr">
              {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
            </small>
            <button type="button" className="text-link" onClick={() => onChange(null)}>
              پاک کردن موقعیت
            </button>
          </>
        )}
      </div>
      <small className="muted">نشانی متنی را جداگانه وارد کنید؛ نقشه نشانی را تکمیل نمی‌کند.</small>
    </section>
  );
}

export function CafeMap({ cafes }: { cafes: Cafe[] }) {
  const [selected, setSelected] = useState('');
  const mapped = cafes.filter((c): c is Cafe & Position => hasPosition(c));
  const active = mapped.find((c) => c.id === selected);
  return (
    <section className="cafe-map-layout">
      <LocationMap points={mapped} selected={active?.id} onSelect={setSelected} />
      <div className="cafe-map-list">
        <div className="section-title">
          <h2>کافه‌های روی نقشه</h2>
          <span className="muted">{digits(mapped.length)} کافه</span>
        </div>
        {!mapped.length && (
          <p className="notice">
            موقعیتی برای کافه‌های این فهرست ثبت نشده است. نشانی متنی را از نمای فهرست ببینید.
          </p>
        )}
        {mapped.map((cafe) => (
          <article
            className={'map-cafe-card' + (active?.id === cafe.id ? ' selected' : '')}
            key={cafe.id}
          >
            <button
              type="button"
              aria-pressed={active?.id === cafe.id}
              onClick={() => setSelected(cafe.id)}
            >
              <strong>{cafe.name}</strong>
              <span>
                {cafe.city}، {cafe.address}
              </span>
            </button>
            {active?.id === cafe.id && (
              <div className="map-cafe-actions">
                <Link className="button secondary" href={'/cafes/' + cafe.id}>
                  مشاهده کافه
                </Link>
                {cafe.owner_id && cafe.active && (
                  <Link className="button primary" href={'/reserve?cafe=' + cafe.id}>
                    رزرو میز
                  </Link>
                )}
              </div>
            )}
          </article>
        ))}
        {cafes.length > mapped.length && (
          <p className="muted">
            {digits(cafes.length - mapped.length)} کافه مختصات ثبت‌شده ندارند.
          </p>
        )}
      </div>
    </section>
  );
}
