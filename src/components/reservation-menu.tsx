'use client';
import { useEffect, useRef, useState } from 'react';
import { Plus, Search, ShoppingBag } from 'lucide-react';
import { useApp } from '@/lib/client';
import { money, digits } from '@/lib/format';
import { normalizeSearch } from '@/lib/cafe-discovery';
import Link from 'next/link';
import { MenuCategories } from './menu-categories';
import { menuCategories, productCategory } from '@/lib/catalog';
import type { CartLine, Product } from '@/lib/types';
import { Confirm, Empty, Field, Media, Modal, Quantity } from './ui';

export function ReservationMenu({
  cafeId,
  variant = 'reservation',
  initialCategory = '',
  category: controlledCategory,
  products: cafeProducts,
  onCategoryChange,
}: {
  cafeId: string;
  variant?: 'reservation' | 'catalog';
  initialCategory?: string;
  category?: string;
  products?: Product[];
  onCategoryChange?: (value: string) => void;
}) {
  const { data, cart, addCart, setCart, toast } = useApp();
  const [search, setSearch] = useState('');
  const [localCategory, setLocalCategory] = useState(initialCategory);
  const category = controlledCategory ?? localCategory;
  const setCategory = onCategoryChange ?? setLocalCategory;
  const [product, setProduct] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState('');
  const [addons, setAddons] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [replace, setReplace] = useState<CartLine | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) opener.current?.focus({ preventScroll: true });
  }, [open]);
  const products = cafeProducts ?? data?.products.filter((p) => p.cafe_id === cafeId) ?? [];
  const filtered = products.filter(
    (p) =>
      (!category || productCategory(p.category) === category) &&
      (!search || normalizeSearch(p.name + ' ' + p.description).includes(normalizeSearch(search))),
  );
  const selectedSize = product?.sizes.find((s) => s.id === size);
  const price = product
    ? product.price +
      (selectedSize?.price || 0) +
      product.addons.filter((a) => addons.includes(a.id)).reduce((sum, a) => sum + a.price, 0)
    : 0;
  function configure(p: Product) {
    setProduct(p);
    setOpen(true);
    setSize(p.sizes[0]?.id || '');
    setAddons([]);
    setQuantity(1);
    setNote('');
  }
  function add() {
    if (!product) return;
    const line: CartLine = {
      key: crypto.randomUUID(),
      product_id: product.id,
      cafe_id: cafeId,
      name: product.name,
      image: product.image,
      price,
      size_id: size,
      addon_ids: addons,
      option_names: [
        ...(selectedSize ? [selectedSize.name] : []),
        ...product.addons.filter((a) => addons.includes(a.id)).map((a) => a.name),
      ],
      quantity,
      note,
    };
    if (addCart(line)) setOpen(false);
    else if (cart.length && cart[0].cafe_id !== cafeId) {
      setOpen(false);
      setReplace(line);
    }
  }
  return (
    <section
      className={'panel reservation-menu' + (variant === 'catalog' ? ' catalog-menu' : '')}
      aria-label={variant === 'catalog' ? 'منوی کافه' : 'منوی رزرو'}
    >
      <div className="section-title">
        <div>
          <h2>{variant === 'catalog' ? 'منو' : 'برای میزت چه سفارشی آماده کنیم؟'}</h2>
          <p>
            {variant === 'catalog'
              ? 'غذا یا نوشیدنی دلخواهت را انتخاب کن.'
              : 'انتخاب غذا اختیاری است؛ سفارش همراه رزرو ثبت می‌شود و پرداخت در کافه است.'}
          </p>
        </div>
        <ShoppingBag size={22} />
      </div>
      <div className="search-input full">
        <Search size={18} />
        <input
          aria-label={variant === 'catalog' ? 'جستجوی منوی کافه' : 'جستجوی منوی رزرو'}
          placeholder="جستجوی غذا یا نوشیدنی"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {variant === 'catalog' ? (
        <MenuCategories
          products={products}
          value={category}
          onChange={setCategory}
          label="دسته‌بندی منوی کافه"
        />
      ) : (
        <div
          className="category-tabs reservation-categories"
          role="group"
          aria-label="دسته‌بندی منوی رزرو"
        >
          {['', ...menuCategories(products)].map((c) => (
            <button
              key={c}
              aria-pressed={category === c}
              className={category === c ? 'active' : ''}
              onClick={() => setCategory(c)}
            >
              {c || 'همه'}
            </button>
          ))}
        </div>
      )}
      {filtered.length ? (
        <div className="reservation-menu-list">
          {filtered.map((p) => (
            <article className="reservation-menu-item" key={p.id}>
              <Media src={p.image} alt={p.name} />
              <div>
                <small>{productCategory(p.category)}</small>
                <h3>{p.name}</h3>
                {variant === 'catalog' && !p.available && <small>ناموجود</small>}
                <p>{p.description}</p>
                <strong>{money(p.price)}</strong>
              </div>
              {variant === 'catalog' &&
              !(
                data?.cafes.find((c) => c.id === cafeId)?.owner_id &&
                data?.cafes.find((c) => c.id === cafeId)?.active
              ) ? (
                <Link
                  className="menu-product-add"
                  href={'/products/' + p.id}
                  aria-label={'مشاهده ' + p.name}
                >
                  <Plus size={18} />
                </Link>
              ) : (
                <button
                  className="button secondary"
                  disabled={!p.available || !data?.cafes.find((c) => c.id === cafeId)?.active}
                  aria-label={'انتخاب ' + p.name}
                  onClick={(event) => {
                    opener.current = event.currentTarget;
                    configure(p);
                  }}
                >
                  <Plus size={18} />
                  {p.available ? 'انتخاب' : 'ناموجود'}
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="محصولی پیدا نشد"
          description="دسته‌بندی یا عبارت جستجو را تغییر بده؛ ممکن است کافه هنوز منوی خود را ثبت نکرده باشد."
        />
      )}
      <Modal
        open={open}
        title={product?.name || 'انتخاب محصول'}
        onClose={() => setOpen(false)}
        presentation="sheet"
      >
        {product && (
          <div className="stack">
            {product.sizes.length > 0 && (
              <fieldset className="option-group">
                <legend>اندازه</legend>
                {product.sizes.map((s) => (
                  <label className="option-row" key={s.id}>
                    <span>
                      <input
                        type="radio"
                        name="reservation-size"
                        checked={size === s.id}
                        onChange={() => setSize(s.id)}
                      />
                      {s.name}
                    </span>
                    <strong>{s.price ? '+ ' + money(s.price) : 'بدون هزینه اضافه'}</strong>
                  </label>
                ))}
              </fieldset>
            )}
            {product.addons.length > 0 && (
              <fieldset className="option-group">
                <legend>افزودنی‌ها · حداکثر {digits(product.max_addons)} انتخاب</legend>
                {product.addons.map((a) => (
                  <label className="option-row" key={a.id}>
                    <span>
                      <input
                        type="checkbox"
                        checked={addons.includes(a.id)}
                        disabled={!addons.includes(a.id) && addons.length >= product.max_addons}
                        onChange={(e) =>
                          setAddons(
                            e.target.checked
                              ? [...addons, a.id]
                              : addons.filter((id) => id !== a.id),
                          )
                        }
                      />
                      {a.name}
                    </span>
                    <strong>+ {money(a.price)}</strong>
                  </label>
                ))}
              </fieldset>
            )}
            <Field label="یادداشت محصول">
              <textarea maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="list-row">
              <Quantity value={quantity} onChange={setQuantity} />
              <strong>{money(price * quantity)}</strong>
            </div>
            <button className="button primary full" onClick={add}>
              <Plus size={18} />
              {variant === 'catalog' ? 'افزودن به سبد خرید' : 'افزودن به سفارش رزرو'}
            </button>
          </div>
        )}
      </Modal>
      <Confirm
        open={Boolean(replace)}
        title="سبد کافه قبلی جایگزین شود؟"
        description="برای ثبت سفارش این کافه، محصولات کافه قبلی از سبد حذف می‌شوند."
        onClose={() => setReplace(null)}
        onConfirm={() => {
          if (replace) setCart([replace]);
          setReplace(null);
          toast('محصول به سفارش رزرو اضافه شد.');
        }}
      />
    </section>
  );
}
