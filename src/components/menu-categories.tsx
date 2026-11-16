'use client';
import { Coffee, CupSoda, Pizza, Sandwich, Utensils, LayoutGrid } from 'lucide-react';
import { menuCategories } from '@/lib/catalog';
import type { Product } from '@/lib/types';
const icons = [Coffee, CupSoda, Coffee, Utensils, Pizza, Sandwich, Sandwich];
export function MenuCategories({
  products,
  value,
  onChange,
  label = 'دسته‌بندی منو',
}: {
  products: Pick<Product, 'category'>[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <div className="category-tabs shared-menu-categories" role="group" aria-label={label}>
      {['', ...menuCategories(products)].map((category, index) => {
        const Icon = category ? icons[index - 1] || Utensils : LayoutGrid;
        return (
          <button
            key={category}
            type="button"
            className={value === category ? 'active' : ''}
            aria-pressed={value === category}
            onClick={() => onChange(category)}
          >
            <Icon size={17} />
            {category || 'همه طعم‌ها'}
          </button>
        );
      })}
    </div>
  );
}
