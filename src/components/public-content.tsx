'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowUpLeft,
  CalendarCheck,
  Coffee,
  Headphones,
  LayoutDashboard,
  MapPin,
  Search,
  Star,
  Store,
} from 'lucide-react';
import { api, useApp, useResource } from '@/lib/client';
import { dateLabel } from '@/lib/format';
import type { Article, ArticleSummary, Testimonial } from '@/lib/platform';
import { Empty, ErrorBox, Field, Form, Loading, Media, PageTitle, SectionTitle } from './ui';
import { VitrinListingFilters, VitrinListingPages } from './vitrin-listing';

export function BlogView({ id }: { id?: string }) {
  const query = useSearchParams();
  const resource = useResource<{
    article?: Article;
    articles?: ArticleSummary[];
    categories?: string[];
    related?: ArticleSummary[];
    page?: number;
    pages?: number;
  }>(id ? 'blog/' + id : 'blog' + (query.size ? '?' + query : ''));
  if (id) {
    if (resource.error) return <ErrorBox message={resource.error} retry={resource.reload} />;
    const article = resource.data?.article;
    if (!article) return <Loading />;
    return (
      <div className="vitrin-article-detail">
        <PageTitle
          title={article.title}
          description={
            article.category + ' · ' + dateLabel(article.publish_at || article.created_at)
          }
          back="/blog"
        />
        <article className="panel prose">
          {article.image && (
            <Media src={article.image} alt={article.title} className="service-article-image" />
          )}
          <p>
            <strong>{article.summary}</strong>
          </p>
          {article.body_blocks.length ? (
            article.body_blocks.map((block, index) => {
              if (block.kind === 'image')
                return (
                  <figure className="service-article-figure" key={index}>
                    <img src={block.src} alt={block.alt} loading="lazy" />
                  </figure>
                );
              if (block.kind === 'heading') return <h2 key={index}>{block.text}</h2>;
              if (block.kind === 'quote')
                return (
                  <blockquote className="service-body" key={index}>
                    {block.text}
                  </blockquote>
                );
              if (block.kind === 'list')
                return (
                  <ul key={index}>
                    {block.text
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((line, position) => (
                        <li key={position}>{line}</li>
                      ))}
                  </ul>
                );
              return (
                <p className="service-body" key={index}>
                  {block.text}
                </p>
              );
            })
          ) : (
            <p className="service-body">{article.body}</p>
          )}
        </article>
        {!!resource.data?.related?.length && (
          <section className="service-section">
            <SectionTitle title="نوشته‌های مرتبط" />
            <div className="vitrin-list-cards">
              {resource.data.related.map((item) => (
                <ArticleCard key={item.slug} article={item} />
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }
  return (
    <div className="vitrin-listing">
      <PageTitle
        title="مقالات"
        description="تازه‌ترین مطالب درباره دنیای کافه‌ها برای صاحبان کافه و علاقه‌مندان به کافه‌گردی."
      />
      <VitrinListingFilters kind="blog">
        <select
          key={resource.data?.categories?.length || 0}
          aria-label="دسته‌بندی مقاله"
          name="category"
          defaultValue={query.get('category') || ''}
        >
          <option value="">همه دسته‌ها</option>
          {resource.data?.categories?.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </VitrinListingFilters>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorBox message={resource.error} retry={resource.reload} />
      ) : resource.data?.articles?.length ? (
        <>
          <div className="vitrin-list-cards">
            {resource.data.articles.map((article) => (
              <ArticleCard key={article.slug} article={article} />
            ))}
          </div>
          <VitrinListingPages page={resource.data.page || 1} pages={resource.data.pages || 1} />
        </>
      ) : (
        <Empty
          title="مقاله‌ای پیدا نشد"
          href={query.size ? '/blog' : undefined}
          label="پاک کردن فیلترها"
        />
      )}
    </div>
  );
}
function ArticleCard({ article }: { article: ArticleSummary }) {
  const href = '/blog/' + encodeURIComponent(article.slug);
  return (
    <article className="panel vitrin-article-card">
      {article.image && <Media src={article.image} alt={article.title} />}
      <p className="muted">
        {article.category} · {dateLabel(article.publish_at || article.created_at)}
      </p>
      <h2>
        <Link href={href}>{article.title}</Link>
      </h2>
      <p>{article.summary}</p>
      <Link href={href} className="text-link">
        خواندن نوشته
      </Link>
    </article>
  );
}

const questions = [
  [
    'چطور در کافه میز رزرو کنم؟',
    'صفحه کافه را باز کنید و از بخش رزرو، روز، ساعت و تعداد نفرات را انتخاب کنید. وضعیت درخواست در بخش رزروهای من نمایش داده می‌شود.',
  ],
  [
    'چطور از سر میز سفارش بدهم؟',
    'کد روی میز را با دوربین یا گزینه اسکن در ویتکو باز کنید. بعد از انتخاب از منو، سفارش به همراه شماره میز برای کافه ارسال می‌شود. از همان صفحه می‌توانید صندوق‌دار را خبر کنید.',
  ],
  [
    'از کجا بلیت یا ثبت‌نام رویداد را ببینم؟',
    'برای ثبت‌نام از صفحه رویداد اقدام کنید. در رویدادهای پولی، ثبت‌نام بعد از تأیید پرداخت قطعی می‌شود. وضعیت بلیت در بخش ثبت‌نام‌های من قابل پیگیری است.',
  ],
  [
    'چطور سفارش یا پرداخت را پیگیری کنم؟',
    'جزئیات را در بخش سفارش‌ها بررسی کنید. برای گفت‌وگو با پشتیبانی، شناسه سفارش را به درخواست خود اضافه کنید.',
  ],
  [
    'چطور کافه‌ام را در ویتکو مدیریت کنم؟',
    'با حساب خود وارد شوید و از بخش ثبت و مدیریت کافه، صفحه کافه را بسازید. تنظیمات شعبه، منو، رزرو، میز و کارکنان در فضای کار کافه قرار دارند.',
  ],
];

export function VitrinMarketingHeading({
  title,
  highlight,
  description,
}: {
  title: string;
  highlight: string;
  description?: string;
}) {
  return (
    <div className="vitrin-marketing-heading">
      <div>
        <h1>
          {title} <span>{highlight}</span>
          <svg viewBox="0 0 60 48" width={60} height={48} aria-hidden="true">
            <path
              fill="currentColor"
              d="M0.715272 6.72034C-1.16519 3.83619 0.881685 0 4.2987 0.00560028L55.6981 0C59.1206 0 61.1675 3.83619 59.2815 6.72034L33.5818 46.0511C31.8844 48.6496 28.1124 48.6496 26.415 46.0511L0.715272 6.72034Z"
            />
          </svg>
        </h1>
        <hr />
      </div>
      {description && <p>{description}</p>}
    </div>
  );
}

export function AboutView() {
  const features = [
    {
      icon: MapPin,
      title: 'کشف کافه‌ها',
      body: 'کافه‌های شهر را جستجو کنید، روی نقشه ببینید و قبل از رفتن با فضا و موقعیت هر کافه آشنا شوید.',
    },
    {
      icon: Coffee,
      title: 'منو و تجربه حضور',
      body: 'منوی دیجیتال را ببینید، رویدادها و میتینگ‌ها را دنبال کنید و برای رزرو میز برنامه‌ریزی کنید.',
    },
    {
      icon: Store,
      title: 'ویترینی برای کافه‌ها',
      body: 'صاحبان کافه می‌توانند منو، سفارش و حضور آنلاین خود را در یک پنل مدیریت کنند و بهتر دیده شوند.',
    },
  ];
  return (
    <div className="vitrin-marketing">
      <VitrinMarketingHeading title="درباره" highlight="ویترین کافه" />
      <article className="vitrin-about-copy">
        <p>
          ویترین کافه بستری است برای پیدا کردن کافه‌ها و تجربه‌ای ساده‌تر از کافه‌گردی. اطلاعات
          پراکنده منو، فضا، موقعیت و برنامه‌ها در یک مسیر دیجیتال جمع شده تا هم مهمان و هم صاحب کافه
          کار راحت‌تری داشته باشند.
        </p>
        <h2>ویترین کافه چیست؟</h2>
        <p>
          به‌جای جستجوی پراکنده در نقشه‌ها و شبکه‌های اجتماعی، کافه‌های شهر را در یک جا می‌بینید.
          می‌توانید فضا و منو را بررسی کنید، رویدادها و میتینگ‌ها را دنبال کنید و در صورت نیاز سفارش
          دهید یا میز رزرو کنید.
        </p>
        <h3>اگر دنبال کافه می‌گردید</h3>
        <p>
          کافه‌ها را جستجو کنید، روی نقشه ببینید و قبل از رفتن با فضا و منوی هر مجموعه آشنا شوید.
          رویدادها و میتینگ‌ها هم در همین مسیر در دسترس هستند.
        </p>
        <h3>اگر کافه دارید</h3>
        <p>
          منو، سفارش و حضور آنلاین کافه در یک پنل مدیریت می‌شود تا مهمان‌ها راحت‌تر پیدایتان کنند.
        </p>
      </article>
      <section className="vitrin-marketing-section">
        <SectionTitle title="امکانات ویترین کافه" description="سه مسیر اصلی تجربه در ویترین کافه" />
        <div className="vitrin-list-cards">
          {features.map(({ icon: Icon, title, body }) => (
            <article className="vitrin-marketing-feature" key={title}>
              <Icon size={22} />
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
      <Testimonials />
      <section className="vitrin-marketing-cta">
        <div>
          <h2>کافه‌گردی را شروع کنید</h2>
          <p>فهرست کافه‌ها را ببینید و کافه مناسب خود را پیدا کنید.</p>
        </div>
        <Link href="/cafes" className="button primary">
          مشاهده کافه‌ها <ArrowUpLeft size={18} />
        </Link>
      </section>
    </div>
  );
}

export function FaqView() {
  const [search, setSearch] = useState('');
  const normalized = search.trim();
  const matching = questions.filter(([question, answer]) =>
    (question + ' ' + answer).includes(normalized),
  );
  return (
    <div className="vitrin-marketing">
      <VitrinMarketingHeading
        title="سوالات"
        highlight="متداول"
        description="پاسخ شفاف به رایج‌ترین پرسش‌ها درباره سفارش، پرداخت، رزرو و حساب کاربری."
      />
      <section className="vitrin-marketing-section">
        <SectionTitle title="پرسش‌های پرتکرار" description="سریع‌ترین مسیر برای پیدا کردن پاسخ" />
        <div className="vitrin-list-cards">
          {questions.slice(0, 3).map(([question, answer]) => (
            <article className="vitrin-marketing-feature" key={question}>
              <Star size={20} />
              <h3>{question}</h3>
              <p>{answer}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="vitrin-marketing-section">
        <SectionTitle title="همه سوالات" description="جستجو کنید و پاسخ پرسش خود را پیدا کنید" />
        <div className="vitrin-list-search">
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="جستجوی سوال"
            placeholder="جستجوی سوال…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="panel prose service-disclosures">
          {matching.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
          {!matching.length && <p>سوالی با این عبارت پیدا نشد.</p>}
        </div>
      </section>
      <section className="vitrin-marketing-cta">
        <h2>هنوز سوالی دارید؟</h2>
        <Link className="button primary" href="/contact">
          تماس با ما <ArrowUpLeft size={18} />
        </Link>
      </section>
    </div>
  );
}

export function ContactView({ partnership = false }: { partnership?: boolean }) {
  const { data } = useApp();
  const [sent, setSent] = useState(false);
  return (
    <div className="vitrin-marketing">
      <VitrinMarketingHeading
        title={partnership ? 'همکاری با' : 'تماس با'}
        highlight={partnership ? 'ویترین کافه' : 'ما'}
        description={
          partnership
            ? 'کافه خود را به جامعه عاشقان قهوه معرفی کنید؛ با منوی دیجیتال، رزرو هوشمند، گزارش‌ها و ابزارهای رشد.'
            : 'اگر سوالی دارید یا نیاز به راهنمایی دارید، از طریق راه‌های ارتباطی زیر با ما در تماس باشید.'
        }
      />
      {partnership && (
        <section className="vitrin-marketing-section">
          <img
            className="vitrin-partnership-photo"
            src="/images/coop.webp"
            alt="همکاری با ویترین کافه"
          />
          <SectionTitle
            title="امکانات پلتفرم"
            description="ابزارهایی که مدیریت کافه را ساده‌تر و حرفه‌ای‌تر می‌کند"
          />
          <div className="vitrin-list-cards">
            {(
              [
                [LayoutDashboard, 'داشبورد مدیریت'],
                [Coffee, 'منوی دیجیتال'],
                [CalendarCheck, 'رزرو هوشمند'],
              ] as const
            ).map(([Icon, label]) => (
              <article className="vitrin-marketing-feature" key={label}>
                <Icon size={22} />
                <h3>{label}</h3>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className="vitrin-contact-grid">
        <aside className="vitrin-contact-aside">
          <section className="panel prose">
            <h2>{partnership ? 'مدیریت کافه در ویترین کافه' : 'پیگیری سفارش و رزرو'}</h2>
            <Link className="button secondary" href={partnership ? '/dashboard' : '/support'}>
              {partnership ? <Store size={18} /> : <Headphones size={18} />}
              {partnership ? 'ثبت و مدیریت کافه' : 'گفت‌وگو با پشتیبانی'}
            </Link>
            <p>
              <Link className="text-link" href={partnership ? '/contact' : '/partnership'}>
                {partnership ? 'تماس با ما' : 'همکاری با ویترین کافه'}
              </Link>
            </p>
          </section>
          {!partnership && <img src="/vitrin/location.webp" alt="موقعیت کافه" />}
        </aside>
        <section className="panel vitrin-contact-form">
          <h2>{partnership ? 'درخواست همکاری' : 'پیام شما'}</h2>
          {sent ? (
            <div role="status">
              <p>پیام شما ثبت شد. پاسخ از راه ارتباطی که وارد کردید پیگیری می‌شود.</p>
              <button className="button secondary" onClick={() => setSent(false)}>
                فرستادن پیام دیگر
              </button>
            </div>
          ) : (
            <Form
              onSubmit={async (form) => {
                await api(
                  'contact-messages/' + (partnership ? 'partnership' : 'contact'),
                  'POST',
                  Object.fromEntries(form),
                );
                setSent(true);
              }}
            >
              <Field label="نام">
                <input
                  name="name"
                  autoComplete="name"
                  defaultValue={data?.user?.name || ''}
                  required
                />
              </Field>
              <Field label="ایمیل یا شماره همراه">
                <input
                  name="contact"
                  dir="ltr"
                  defaultValue={data?.user?.email || data?.user?.phone || ''}
                  required
                />
              </Field>
              <Field label={partnership ? 'نام کافه یا مجموعه' : 'موضوع'}>
                <input name="subject" required />
              </Field>
              <Field label={partnership ? 'جزئیات همکاری' : 'متن پیام'}>
                <textarea name="body" rows={6} maxLength={5000} required />
              </Field>
            </Form>
          )}
        </section>
      </div>
    </div>
  );
}

export function Testimonials() {
  const { data } = useResource<{ testimonials: Testimonial[] }>('testimonials');
  if (!data?.testimonials.length) return null;
  return (
    <section className="service-section">
      <SectionTitle title="تجربه همراهان ویتکو" />
      <div className="service-card-grid">
        {data.testimonials.map((item) => (
          <figure key={item.id} className="panel">
            <blockquote className="service-body">{item.body}</blockquote>
            <figcaption className="service-inline">
              {item.image && <img src={item.image} alt="" className="avatar small" />}
              <div>
                <strong>{item.name}</strong>
                {item.byline && <p className="muted">{item.byline}</p>}
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
