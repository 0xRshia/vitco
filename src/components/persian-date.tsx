'use client';
import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { dateLabel, digits, today } from '@/lib/format';

const dayNumber = (date: Date) =>
  Number(
    new Intl.DateTimeFormat('en-u-ca-persian', { day: 'numeric', timeZone: 'UTC' }).format(date),
  );
function startOfMonth(value: string) {
  const date = new Date(value + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() - dayNumber(date) + 1);
  return date;
}
function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}
export function PersianDateInput({
  name,
  value,
  onChange,
  defaultValue,
  min,
}: {
  name?: string;
  value?: string;
  onChange?: (v: string) => void;
  defaultValue?: string;
  min?: string;
}) {
  const [local, setLocal] = useState(defaultValue || ''),
    [open, setOpen] = useState(false),
    [month, setMonth] = useState(() => startOfMonth(value || defaultValue || today()));
  const selected = value ?? local,
    start = (month.getUTCDay() + 1) % 7;
  const cells = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(month);
    date.setUTCDate(date.getUTCDate() + i - start);
    return date;
  });
  function move(direction: number) {
    const date = new Date(month);
    date.setUTCDate(date.getUTCDate() + (direction === 1 ? 32 : -1));
    setMonth(startOfMonth(iso(date)));
  }
  return (
    <div className="persian-date">
      <input name={name} type="hidden" value={selected} />
      <button
        type="button"
        className="date-input-button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>{selected ? dateLabel(selected) : 'انتخاب تاریخ'}</span>
        <CalendarDays size={18} />
      </button>
      {open && (
        <div className="calendar-popover">
          <div className="calendar-heading">
            <button type="button" aria-label="ماه قبل" onClick={() => move(-1)}>
              <ChevronRight size={19} />
            </button>
            <strong>
              {new Intl.DateTimeFormat('fa-IR', {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              }).format(month)}
            </strong>
            <button type="button" aria-label="ماه بعد" onClick={() => move(1)}>
              <ChevronLeft size={19} />
            </button>
          </div>
          <div className="calendar-grid">
            {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((d, i) => (
              <small key={i}>{d}</small>
            ))}
            {cells.map((d) => {
              const date = iso(d),
                sameMonth = startOfMonth(date).getTime() === month.getTime();
              return (
                <button
                  key={date}
                  type="button"
                  disabled={Boolean(min && date < min)}
                  aria-label={dateLabel(date)}
                  className={(selected === date ? 'selected ' : '') + (!sameMonth ? 'outside' : '')}
                  onClick={() => {
                    setLocal(date);
                    onChange?.(date);
                    setOpen(false);
                  }}
                >
                  {digits(dayNumber(d))}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              setMonth(startOfMonth(today()));
            }}
          >
            ماه جاری
          </button>
        </div>
      )}
    </div>
  );
}
export function PersianTimeInput({
  name,
  value,
  onChange,
  defaultValue = '09:00',
}: {
  name?: string;
  value?: string;
  onChange?: (v: string) => void;
  defaultValue?: string;
}) {
  const [local, setLocal] = useState(defaultValue);
  return (
    <select
      name={name}
      value={value ?? local}
      onChange={(e) => {
        setLocal(e.target.value);
        onChange?.(e.target.value);
      }}
    >
      {Array.from({ length: 48 }, (_, i) => {
        const time = String(Math.floor(i / 2)).padStart(2, '0') + ':' + (i % 2 ? '30' : '00');
        return (
          <option key={time} value={time}>
            {digits(time)}
          </option>
        );
      })}
    </select>
  );
}
