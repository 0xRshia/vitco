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
  'addresses',
  'payment',
  'rewards',
  'favorites',
  'notifications',
  'support',
  'login',
  'register',
  'verify',
  'forgot-password',
  'reset-password',
  'events',
  'about',
  'contact',
  'privacy',
  'terms',
  'dashboard',
  'scan',
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
