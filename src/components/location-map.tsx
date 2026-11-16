'use client';
import { useMemo } from 'react';
import { MapCanvas, type MapPoint } from './map-canvas';
import { hasCoordinates, type GeoPoint } from '@/lib/cafe-discovery';
export type Position = GeoPoint;
export const hasPosition = hasCoordinates;
const emptyPoints: MapPoint[] = [];
export function LocationMap({
  points = emptyPoints,
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
  onChange?: (value: Position) => void;
  label?: string;
}) {
  const serialized = JSON.stringify({ points, value, selected });
  const settings = useMemo(() => {
    const data = JSON.parse(serialized) as {
      points: MapPoint[];
      value?: Position | null;
      selected?: string;
    };
    const mapped = data.points.filter(hasPosition);
    if (data.value) mapped.push({ id: 'address', name: 'موقعیت انتخاب‌شده', ...data.value });
    const focused =
      mapped.find((point) => point.id === data.selected) ||
      (data.value ? mapped.find((point) => point.id === 'address') : undefined);
    return {
      points: mapped,
      camera: {
        points: focused ? [focused] : mapped,
        zoom: focused ? 15 : undefined,
        revision: serialized,
      },
    };
  }, [serialized]);
  return (
    <div className="location-map-shell">
      <MapCanvas
        className="location-map"
        points={settings.points}
        camera={settings.camera}
        selected={selected}
        onSelect={onSelect}
        onChange={onChange}
        label={label}
      />
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
