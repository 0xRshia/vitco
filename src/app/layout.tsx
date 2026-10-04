import type { Metadata, Viewport } from 'next';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/600.css';
import '@fontsource/vazirmatn/700.css';
import '@fontsource/vazirmatn/800.css';
import './globals.css';
import { Provider } from '@/lib/client';
export const metadata: Metadata = {
  title: { default: 'ویترین کافه | قرارِ لحظه‌های خوب', template: '%s | ویترین کافه' },
  description:
    'کافه‌های شهر را کشف کنید، منوها را ببینید، میز رزرو کنید و از لحظه‌های خوب لذت ببرید.',
  icons: { icon: '/icon.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f8f6f3' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
