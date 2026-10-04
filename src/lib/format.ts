export const digits = (value: number | string) =>
  String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
export const latin = (value: string) =>
  value.replace(/[۰-۹٠-٩]/g, (d) =>
    String('۰۱۲۳۴۵۶۷۸۹'.includes(d) ? '۰۱۲۳۴۵۶۷۸۹'.indexOf(d) : '٠١٢٣٤٥٦٧٨٩'.indexOf(d)),
  );
export const money = (value: number) => new Intl.NumberFormat('fa-IR').format(value) + ' تومان';
export function dateLabel(value: string, withTime = false) {
  const date = new Date(value.length === 10 ? value + 'T12:00:00+03:30' : value);
  if (Number.isNaN(date.getTime())) return 'تاریخ نامعتبر';
  return new Intl.DateTimeFormat('fa-IR', {
    timeZone: 'Asia/Tehran',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}
export function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
}
export function daysAhead(count = 14) {
  const base = new Date(today() + 'T12:00:00Z');
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}
export const statusLabels: Record<string, string> = {
  pending: 'در انتظار تأیید',
  confirmed: 'تأیید شده',
  preparing: 'در حال آماده‌سازی',
  ready: 'آماده تحویل',
  delivering: 'در مسیر شما',
  completed: 'تکمیل شده',
  cancelled: 'لغو شده',
};
export const amenities: Record<string, string> = {
  wifi: 'اینترنت رایگان',
  music: 'موسیقی زنده',
  smoking: 'فضای سیگار',
  outdoor: 'فضای باز',
  parking: 'پارکینگ',
  work: 'مناسب کار',
  family: 'مناسب خانواده',
};
