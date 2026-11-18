import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Application } from '@/components/application';
import { Loading } from '@/components/ui';
const routes = [
  'cafes',
  'menu',
  'products',
  'cart',
  'orders',
  'reservations',
  'reserve',
  'profile',
  'settings',
  'telegram-settings',
  'addresses',
  'payment',
  'bill',
  'rewards',
  'favorites',
  'notifications',
  'support',
  'tickets',
  'login',
  'register',
  'verify',
  'forgot-password',
  'reset-password',
  'events',
  'registrations',
  'about',
  'contact',
  'partnership',
  'faq',
  'blog',
  'admin',
  'privacy',
  'terms',
  'dashboard',
  'scan',
  'scanner',
  't',
  'operations',
  'meetings',
];
export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  if (slug.length > 2 || (slug[0] && !routes.includes(slug[0]))) notFound();
  return (
    <Suspense fallback={<Loading />}>
      <Application />
    </Suspense>
  );
}
