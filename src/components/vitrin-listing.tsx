'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { digits } from '@/lib/format';

export function VitrinListingFilters({
  kind,
  children,
}: {
  kind: 'blog' | 'events';
  children: ReactNode;
}) {
  const router = useRouter();
  const query = useSearchParams();
  const search = kind === 'blog' ? 'جستجوی مقاله' : 'جستجوی رویداد';
  return (
    <form
      key={query.toString()}
      className={'vitrin-list-filters vitrin-list-filters-' + kind}
      onSubmit={(event) => {
        event.preventDefault();
        const params = new URLSearchParams();
        for (const [key, entry] of new FormData(event.currentTarget)) {
          const value = String(entry).trim();
          if (value && !(key === 'sort' && value === 'starts_at')) params.set(key, value);
        }
        router.replace('/' + kind + (params.size ? '?' + params : ''), { scroll: false });
      }}
    >
      <div className="vitrin-list-search">
        <Search size={16} aria-hidden="true" />
        <input
          id="vitrin-list-search"
          aria-label={search}
          placeholder={search + '…'}
          maxLength={120}
          name="q"
          defaultValue={query.get('q') || ''}
        />
      </div>
      {children}
      <button type="submit" className="button primary">
        {kind === 'blog' ? 'اعمال فیلتر' : 'اعمال'}
      </button>
    </form>
  );
}

export function VitrinListingPages({ page, pages }: { page: number; pages: number }) {
  const path = usePathname();
  const query = useSearchParams();
  if (pages <= 1) return null;
  function href(target: number) {
    const params = new URLSearchParams(query);
    if (target > 1) params.set('page', String(target));
    else params.delete('page');
    return path + (params.size ? '?' + params : '');
  }
  return (
    <nav className="vitrin-list-pages" aria-label="صفحه‌های نتایج">
      {page > 1 && (
        <Link className="button secondary compact" href={href(page - 1)}>
          قبلی
        </Link>
      )}
      <span aria-current="page">
        {digits(page)} از {digits(pages)}
      </span>
      {page < pages && (
        <Link className="button secondary compact" href={href(page + 1)}>
          بعدی
        </Link>
      )}
    </nav>
  );
}
