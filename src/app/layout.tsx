import type { Metadata, Viewport } from 'next';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/600.css';
import '@fontsource/vazirmatn/700.css';
import '@fontsource/vazirmatn/800.css';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import './ui-foundations.css';
import './home-profile.css';
import './commerce.css';
import './locations-reservations.css';
import { Provider } from '@/lib/client';
export const metadata: Metadata = {
  title: { default: 'ویتکو | قرارِ لحظه‌های خوب', template: '%s | ویتکو' },
  description:
    'کافه‌های شهر را کشف کنید، منوها را ببینید، میز رزرو کنید و از لحظه‌های خوب لذت ببرید.',
  icons: { icon: '/icon.svg' },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f7fa' },
    { media: '(prefers-color-scheme: dark)', color: '#18181b' },
  ],
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
