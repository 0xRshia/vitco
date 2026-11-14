import type { CafeEvent } from './types';

export type EventPhase = 'upcoming' | 'ongoing' | 'ended' | 'unknown';

export function eventPhase(
  event: Pick<CafeEvent, 'date' | 'time'> & { end_time?: string },
  now = Date.now(),
): EventPhase {
  const starts = Date.parse(`${event.date}T${event.time}:00+03:30`);
  if (!Number.isFinite(starts)) return 'unknown';
  if (now < starts) return 'upcoming';
  if (!event.end_time) return 'unknown';
  const ends = Date.parse(`${event.date}T${event.end_time}:00+03:30`);
  if (!Number.isFinite(ends) || ends <= starts) return 'unknown';
  return now < ends ? 'ongoing' : 'ended';
}

export const eventPhaseLabels: Record<EventPhase, string> = {
  upcoming: 'پیش رو',
  ongoing: 'در حال برگزاری',
  ended: 'پایان‌یافته',
  unknown: 'شروع‌شده؛ زمان پایان ثبت نشده',
};
