import { randomUUID } from 'node:crypto';
import { all, hydrate, one, run, transaction } from './database';
import { platformAdmin } from './cafe-access';
import { cafeFeatures, setFeatures } from './cafe-features';
import { operatorTickets } from './tickets';
import { cafeSql, transitionOrder } from './commerce';
import { paymentIntakeSettings, updatePaymentIntake } from './payment-intake';
import type { Cafe, Order, User } from './types';
import * as v from './validation';

export type ArticleBlock =
  | { kind: 'paragraph' | 'heading' | 'quote' | 'list'; text: string }
  | { kind: 'image'; src: string; alt: string };
export type Article = {
  slug: string;
  title: string;
  category: string;
  summary: string;
  body: string;
  body_blocks: ArticleBlock[];
  image: string;
  published: number;
  publish_at: string;
  created_at: string;
  updated_at: string;
};
export type ArticleSummary = Omit<Article, 'body' | 'body_blocks'>;
export type Testimonial = {
  id: string;
  name: string;
  byline: string;
  body: string;
  image: string;
  visible: number;
};
export type PlatformUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  suspended: number;
  created_at: string;
};
export type ContactMessage = {
  id: string;
  kind: 'contact' | 'partnership';
  name: string;
  contact: string;
  subject: string;
  body: string;
  created_at: string;
  read: number;
};
export type ManagedCafe = {
  id: string;
  name: string;
  city: string;
  active: number;
  owner_name: string;
  features: ReturnType<typeof cafeFeatures>;
};
export type HomeCafePlacement = { cafe_id: string; name: string; city: string; position: number };
const placementJoin = ` JOIN home_cafe_placements p ON p.cafe_id=c.id
  WHERE c.is_demo=0 ORDER BY p.position,c.id`;
function homeCafePlacements() {
  return all<HomeCafePlacement>(
    'SELECT p.cafe_id,c.name,c.city,p.position FROM cafes c' + placementJoin,
  );
}
export function paidHomeCafes() {
  return all(cafeSql + placementJoin).map(hydrate<Cafe>);
}
export type PlatformReview = {
  id: string;
  cafe_name: string;
  name: string;
  body: string;
  rating: number;
  visible: number;
};

function categories() {
  return all<{ name: string }>('SELECT name FROM article_categories ORDER BY name').map(
    (row) => row.name,
  );
}
function articleSlug(value: unknown) {
  const slug = v.text(value, 'نشانی نوشته', 2, 90).toLowerCase();
  v.ensure(
    /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug),
    'برای نشانی نوشته از حروف، عدد و خط تیره استفاده کنید.',
  );
  return slug;
}
const publishedArticle = "published=1 AND (publish_at='' OR publish_at<=?)";
const articleSummary =
  'slug,title,category,summary,image,published,publish_at,created_at,updated_at';
const articleSort = "ORDER BY COALESCE(NULLIF(publish_at,''),created_at) DESC,slug";
export function publicArticles(
  slug?: string,
  category?: string | null,
  now = new Date().toISOString(),
  params = new URLSearchParams(),
) {
  if (slug) {
    const row = one('SELECT * FROM articles WHERE slug=? AND ' + publishedArticle, slug, now);
    v.ensure(row, 'این نوشته پیدا نشد.', 404);
    const article = hydrate<Article>(row);
    const related = all<ArticleSummary>(
      `SELECT ${articleSummary} FROM articles WHERE slug<>? AND category=? AND ${publishedArticle} ${articleSort} LIMIT 3`,
      slug,
      article.category,
      now,
    );
    return { article, related };
  }
  const search = v.text(params.get('q') ?? '', 'عبارت جستجو', 0, 120);
  const filter = `${publishedArticle} AND (? IS NULL OR category=?)
    AND (?='' OR instr(lower(title || ' ' || summary || ' ' || body),lower(?))>0)`;
  const values = [now, category ?? null, category ?? null, search, search] as const;
  const pageSize = 12;
  const total = one<{ count: number }>(
    'SELECT COUNT(*) count FROM articles WHERE ' + filter,
    ...values,
  )!.count;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, v.integer(params.get('page') || 1, 'صفحه', 1));
  return {
    page,
    pages,
    categories: all<{ category: string }>(
      'SELECT DISTINCT category FROM articles WHERE ' + publishedArticle + ' ORDER BY category',
      now,
    ).map((row) => row.category),
    articles: all<ArticleSummary>(
      `SELECT ${articleSummary} FROM articles WHERE ${filter} ${articleSort} LIMIT ? OFFSET ?`,
      ...values,
      pageSize,
      (page - 1) * pageSize,
    ),
  };
}
export function publicTestimonials() {
  return all<Testimonial>(
    'SELECT id,name,byline,body,image,visible FROM testimonials WHERE visible=1 ORDER BY created_at DESC LIMIT 24',
  );
}
export function submitContact(kind: string, input: Record<string, unknown>) {
  v.ensure(kind === 'contact' || kind === 'partnership', 'فرم پیدا نشد.', 404);
  const name = v.text(input.name, 'نام', 2, 80),
    subject = v.text(input.subject, 'موضوع', 3, 120);
  const body = v.text(input.body, 'متن پیام', 10, 5000),
    value = v.text(input.contact, 'ایمیل یا شماره همراه', 3, 254);
  const contact = value.includes('@') ? v.email(value) : v.phone(value);
  const id = randomUUID();
  run(
    'INSERT INTO contact_messages(id,kind,name,contact,subject,body,created_at) VALUES (?,?,?,?,?,?,?)',
    id,
    kind,
    name,
    contact,
    subject,
    body,
    new Date().toISOString(),
  );
  return { id };
}
function articleBlocks(input: unknown): ArticleBlock[] {
  return v.list(input, 60).map((item) => {
    const block = v.object(item);
    if (block.kind === 'image') {
      const src = v.imagePath(block.src);
      v.ensure(src, 'تصویر بخش مقاله را بارگذاری کنید.');
      return { kind: 'image', src, alt: v.text(block.alt ?? '', 'توضیح تصویر', 0, 160) };
    }
    const kind = block.kind;
    v.ensure(
      kind === 'paragraph' || kind === 'heading' || kind === 'quote' || kind === 'list',
      'نوع بخش مقاله معتبر نیست.',
    );
    return { kind, text: v.text(block.text, 'محتوای بخش', 1, 32000) };
  });
}
function saveArticle(input: Record<string, unknown>, existing?: string) {
  const slug = existing || articleSlug(input.slug);
  const title = v.text(input.title, 'عنوان', 3, 160),
    category = v.text(input.category, 'دسته‌بندی', 2, 60);
  const blocks = input.body_blocks === undefined ? [] : articleBlocks(input.body_blocks);
  const textBody = blocks
    .flatMap((block) => (block.kind === 'image' ? [] : [block.text]))
    .join('\n\n');
  const summary = v.text(input.summary, 'خلاصه', 5, 360),
    body = v.text(blocks.length ? textBody : input.body, 'متن نوشته', 10, 32000);
  const publication =
    input.publish_date === undefined
      ? null
      : input.publish_date
        ? new Date(
            v.date(input.publish_date) + 'T' + v.time(input.publish_time) + ':00+03:30',
          ).toISOString()
        : '';
  const image = v.imagePath(input.image),
    published = Number(v.flag(input.published)),
    now = new Date().toISOString();
  transaction(() => {
    v.ensure(
      one('SELECT name FROM article_categories WHERE name=?', category),
      'ابتدا دسته‌بندی نوشته را بسازید.',
    );
    if (existing) {
      const count = run(
        'UPDATE articles SET title=?,category=?,summary=?,body=?,body_blocks=CASE WHEN ? OR body<>? THEN ? ELSE body_blocks END,image=?,published=?,publish_at=COALESCE(?,publish_at),updated_at=? WHERE slug=?',
        title,
        category,
        summary,
        body,
        Number(input.body_blocks !== undefined),
        body,
        JSON.stringify(blocks),
        image,
        published,
        publication,
        now,
        slug,
      );
      v.ensure(count.changes, 'نوشته پیدا نشد.', 404);
      return;
    }
    v.ensure(
      !one('SELECT slug FROM articles WHERE slug=?', slug),
      'این نشانی برای نوشته دیگری استفاده شده است.',
      409,
    );
    run(
      'INSERT INTO articles(slug,title,category,summary,body,body_blocks,image,published,publish_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      slug,
      title,
      category,
      summary,
      body,
      JSON.stringify(blocks),
      image,
      published,
      publication ?? '',
      now,
      now,
    );
  });
  return { slug };
}
function changeCategory(input: Record<string, unknown>, method: string, existing?: string) {
  return transaction(() => {
    if (existing)
      v.ensure(
        one('SELECT name FROM article_categories WHERE name=?', existing),
        'دسته‌بندی پیدا نشد.',
        404,
      );
    if (method === 'DELETE' && existing) {
      v.ensure(
        !one('SELECT slug FROM articles WHERE category=?', existing),
        'ابتدا دسته‌بندی نوشته‌های این بخش را عوض کنید.',
        409,
      );
      run('DELETE FROM article_categories WHERE name=?', existing);
    } else {
      const name = v.text(input.name, 'نام دسته‌بندی', 2, 60);
      if (name === existing) return { ok: true };
      v.ensure(
        !one('SELECT name FROM article_categories WHERE name=?', name),
        'دسته‌بندی با این عنوان وجود دارد.',
        409,
      );
      run('INSERT INTO article_categories(name) VALUES (?)', name);
      if (existing) {
        run('UPDATE articles SET category=? WHERE category=?', name, existing);
        run('DELETE FROM article_categories WHERE name=?', existing);
      }
    }
    return { ok: true };
  });
}
const userFields = 'id,name,email,phone,suspended,created_at';
const regularAccount = "account_kind='member'";
function manageAccount(actor: User, id: string, input: Record<string, unknown>) {
  const person = one<PlatformUser>(
    `SELECT ${userFields} FROM users WHERE id=? AND ${regularAccount}`,
    id,
  );
  v.ensure(person, 'حساب پیدا نشد.', 404);
  transaction(() => {
    if (input.name !== undefined)
      run('UPDATE users SET name=? WHERE id=?', v.text(input.name, 'نام', 2, 80), id);
    if (input.suspended !== undefined) {
      v.ensure(id !== actor.id, 'حساب مدیر فعال را نمی‌توان تعلیق کرد.', 409);
      const suspended = v.flag(input.suspended);
      run('UPDATE users SET suspended=? WHERE id=?', Number(suspended), id);
      if (suspended) run('DELETE FROM sessions WHERE user_id=?', id);
    }
  });
  return { ok: true };
}
function saveTestimonial(input: Record<string, unknown>, id?: string) {
  const name = v.text(input.name, 'نام', 2, 80),
    byline = v.text(input.byline ?? '', 'عنوان', 0, 100);
  const body = v.text(input.body, 'نقل قول', 3, 1000),
    image = v.imagePath(input.image),
    visible = Number(v.flag(input.visible));
  if (id) {
    v.ensure(
      run(
        'UPDATE testimonials SET name=?,byline=?,body=?,image=?,visible=? WHERE id=?',
        name,
        byline,
        body,
        image,
        visible,
        id,
      ).changes,
      'تجربه مشتری پیدا نشد.',
      404,
    );
  } else {
    run(
      'INSERT INTO testimonials(id,name,byline,body,image,visible,created_at) VALUES(?,?,?,?,?,?,?)',
      randomUUID(),
      name,
      byline,
      body,
      image,
      visible,
      new Date().toISOString(),
    );
  }
  return { ok: true };
}
export function adminApi(
  user: User,
  path: string[],
  method: string,
  input: Record<string, unknown>,
  params: URLSearchParams,
) {
  v.ensure(platformAdmin(user), 'دسترسی میز مدیریت ویتکو مجاز نیست.', 403);
  const [, section, id] = path;
  if (method === 'GET') {
    if (!section)
      return {
        users: one<{ count: number }>(`SELECT COUNT(*) count FROM users WHERE ${regularAccount}`)
          ?.count,
        cafes: one<{ count: number }>(
          'SELECT COUNT(*) count FROM cafes WHERE owner_id IS NOT NULL AND is_demo=0',
        )?.count,
        orders: one<{ count: number }>('SELECT COUNT(*) count FROM orders')?.count,
        unread: one<{ count: number }>('SELECT COUNT(*) count FROM contact_messages WHERE read=0')
          ?.count,
      };
    if (section === 'cafes')
      return {
        cafes: all<Omit<ManagedCafe, 'features'>>(
          'SELECT c.id,c.name,c.city,c.active,u.name owner_name FROM cafes c JOIN users u ON u.id=c.owner_id WHERE c.is_demo=0 AND c.parent_id IS NULL ORDER BY c.name',
        ).map((cafe) => ({ ...cafe, features: cafeFeatures(cafe.id) })),
      };
    if (section === 'placements') return { placements: homeCafePlacements() };
    if (section === 'articles')
      return {
        articles: all('SELECT * FROM articles ORDER BY updated_at DESC').map(hydrate<Article>),
        categories: categories(),
      };
    if (section === 'testimonials')
      return {
        testimonials: all<Testimonial>('SELECT * FROM testimonials ORDER BY created_at DESC'),
      };
    if (section === 'messages')
      return {
        messages: all<ContactMessage>(
          'SELECT * FROM contact_messages ORDER BY read,created_at DESC LIMIT 150',
        ),
      };
    if (section === 'reviews')
      return {
        reviews: all<PlatformReview>(
          'SELECT r.id,r.body,r.rating,r.visible,c.name cafe_name,u.name FROM reviews r JOIN cafes c ON c.id=r.cafe_id JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 150',
        ),
      };
    if (section === 'tickets') return { tickets: operatorTickets(user) };
    if (section === 'payments') return { gateway: paymentIntakeSettings() };
    if (section === 'orders') {
      const orderSql =
        'SELECT o.*,c.name cafe_name,u.name customer_name FROM orders o JOIN cafes c ON c.id=o.cafe_id JOIN users u ON u.id=o.user_id';
      if (id) {
        const order = one(orderSql + ' WHERE o.id=?', id);
        v.ensure(order, 'سفارش پیدا نشد.', 404);
        return { order: hydrate<Order>(order) };
      }
      const query = (params.get('q') || '').trim().slice(0, 100);
      const term = '%' + query.replace(/[\\%_]/g, '\\$&') + '%';
      return {
        sales: all(
          orderSql +
            " WHERE (o.id LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\') ORDER BY o.created_at DESC LIMIT 60",
          term,
          term,
          term,
        ).map(hydrate<Order>),
      };
    }
    if (section === 'users' && id) {
      const account = one<PlatformUser>(
        `SELECT ${userFields} FROM users WHERE id=? AND ${regularAccount}`,
        id,
      );
      v.ensure(account, 'حساب پیدا نشد.', 404);
      return {
        account,
        orders: all(
          'SELECT o.id,o.kind,o.status,o.total,o.payment_status,o.created_at,c.name cafe_name FROM orders o JOIN cafes c ON c.id=o.cafe_id WHERE o.user_id=? ORDER BY o.created_at DESC LIMIT 50',
          id,
        ),
        reservations: all(
          'SELECT r.id,r.date,r.time,r.status,r.guests,c.name cafe_name FROM reservations r JOIN cafes c ON c.id=r.cafe_id WHERE r.user_id=? ORDER BY r.date DESC,r.time DESC LIMIT 50',
          id,
        ),
      };
    }
    if (section === 'users') {
      const query = (params.get('q') || '').trim().slice(0, 100);
      const term = '%' + query.replace(/[\\%_]/g, '\\$&') + '%';
      return {
        users: all<PlatformUser>(
          `SELECT ${userFields} FROM users WHERE ${regularAccount} AND (name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\') ORDER BY created_at DESC LIMIT 60`,
          term,
          term,
          term,
        ),
      };
    }
  }
  if (section === 'cafes' && id && method === 'PATCH') {
    setFeatures(user, id, input);
    return { ok: true };
  }
  if (section === 'placements' && id && method === 'PUT') {
    const position = v.integer(input.position, 'اولویت نمایش', 1);
    v.ensure(
      run(
        `INSERT INTO home_cafe_placements(cafe_id,position) SELECT id,? FROM cafes WHERE id=? AND is_demo=0
         ON CONFLICT(cafe_id) DO UPDATE SET position=excluded.position`,
        position,
        id,
      ).changes,
      'کافه‌ای برای نمایش پیدا نشد.',
      404,
    );
    return { ok: true };
  }
  if (section === 'placements' && id && method === 'DELETE') {
    run('DELETE FROM home_cafe_placements WHERE cafe_id=?', id);
    return { ok: true };
  }
  if (section === 'payments' && !id && method === 'PATCH') {
    updatePaymentIntake(input.enabled);
    return { ok: true };
  }
  if (section === 'orders' && id && method === 'PATCH') {
    transitionOrder(user, id, v.text(input.status, 'وضعیت', 1, 30), input.preparation_minutes);
    return { ok: true };
  }
  if (section === 'articles' && (method === 'POST' || (id && method === 'PUT')))
    return saveArticle(input, id);
  if (section === 'categories' && (method === 'POST' || (id && ['PUT', 'DELETE'].includes(method))))
    return changeCategory(input, method, id);
  if (section === 'testimonials' && (method === 'POST' || (id && method === 'PUT')))
    return saveTestimonial(input, id);
  if (section === 'users' && id && method === 'PATCH') return manageAccount(user, id, input);
  if (section === 'articles' && id && method === 'DELETE') {
    v.ensure(run('DELETE FROM articles WHERE slug=?', id).changes, 'نوشته پیدا نشد.', 404);
    return { ok: true };
  }
  if (section === 'testimonials' && id && method === 'DELETE') {
    v.ensure(run('DELETE FROM testimonials WHERE id=?', id).changes, 'تجربه مشتری پیدا نشد.', 404);
    return { ok: true };
  }
  if (section === 'messages' && id && method === 'PATCH') {
    v.ensure(
      run('UPDATE contact_messages SET read=? WHERE id=?', Number(v.flag(input.read)), id).changes,
      'پیام پیدا نشد.',
      404,
    );
    return { ok: true };
  }
  if (section === 'reviews' && id && method === 'PATCH') {
    v.ensure(
      run('UPDATE reviews SET visible=? WHERE id=?', Number(v.flag(input.visible)), id).changes,
      'دیدگاه پیدا نشد.',
      404,
    );
    return { ok: true };
  }
  throw new v.AppError('مسیر پیدا نشد.', 404);
}
