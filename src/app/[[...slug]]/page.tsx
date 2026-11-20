import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { Application } from '@/components/application';
import { Loading } from '@/components/ui';
import { dashboardRedirect, storefrontRedirect } from '@/lib/cafe-links';
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
  const destination = storefrontRedirect(slug) || dashboardRedirect(slug);
  if (destination) redirect(destination);
  if (slug.length === 1 && slug[0] === 'loyalty') redirect('/rewards');
  if (slug.length === 2 && slug[0] === 'settings' && slug[1] === 'profile') redirect('/profile');
  if (slug.length === 2 && slug[0] === 'user' && slug[1] === 'dashboard') redirect('/profile');
  const orderReceipt = slug.length === 3 && slug[0] === 'orders' && slug[2] === 'invoice';
  const adminProfile = slug.length === 3 && slug[0] === 'admin' && slug[1] === 'users';
  if ((!orderReceipt && !adminProfile && slug.length > 2) || (slug[0] && !routes.includes(slug[0])))
    notFound();
  return (
    <Suspense fallback={<Loading />}>
      <Application />
    </Suspense>
  );
}
