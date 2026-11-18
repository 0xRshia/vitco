'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, useApp, useResource } from '@/lib/client';
import { dateLabel } from '@/lib/format';
import type { Article, ArticleSummary, Testimonial } from '@/lib/platform';
import { Empty, ErrorBox, Field, Form, Loading, Media, PageTitle, SectionTitle } from './ui';

export function BlogView({ id }: { id?: string }) {
  const [category, setCategory] = useState('');
  const resource = useResource<{
    article?: Article;
    articles?: ArticleSummary[];
    categories?: string[];
    related?: ArticleSummary[];
  }>(id ? 'blog/' + id : 'blog' + (category ? '?category=' + encodeURIComponent(category) : ''));
  if (resource.error) return <ErrorBox message={resource.error} retry={resource.reload} />;
  if (id) {
    const article = resource.data?.article;
    if (!article) return <Loading />;
    return (
      <>
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
            <div className="service-card-grid service-gallery">
              {resource.data.related.map((item) => (
                <ArticleCard key={item.slug} article={item} />
              ))}
            </div>
          </section>
        )}
      </>
    );
  }
  return (
    <>
      <PageTitle title="مجله ویتکو" />
      {!!resource.data?.categories?.length && (
        <div className="tabs service-tabs">
          {['', ...resource.data.categories].map((name) => (
            <button
              key={name}
              aria-pressed={name === category}
              className={name === category ? 'active' : ''}
              onClick={() => setCategory(name)}
            >
              {name || 'همه نوشته‌ها'}
            </button>
          ))}
        </div>
      )}
      {resource.loading ? (
        <Loading />
      ) : resource.data?.articles?.length ? (
        <div className="service-card-grid service-gallery">
          {resource.data.articles.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      ) : (
        <Empty title="نوشته‌ای در این بخش منتشر نشده است." />
      )}
    </>
  );
}
function ArticleCard({ article }: { article: ArticleSummary }) {
  const href = '/blog/' + encodeURIComponent(article.slug);
  return (
    <article className="panel">
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
export function FaqView() {
  return (
    <>
      <PageTitle title="پرسش‌های متداول" />
      <div className="panel prose service-disclosures">
        {questions.map(([question, answer]) => (
          <details key={question}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
      <p>
        <Link className="text-link" href="/contact">
          تماس با ویتکو
        </Link>
      </p>
    </>
  );
}

export function ContactView({ partnership = false }: { partnership?: boolean }) {
  const { data } = useApp();
  const [sent, setSent] = useState(false);
  return (
    <>
      <PageTitle title={partnership ? 'همکاری با ویتکو' : 'تماس با ویتکو'} />
      <div className="service-card-grid">
        <section className="panel">
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
        <section className="panel prose">
          <h2>{partnership ? 'مدیریت کافه در ویتکو' : 'پیگیری سفارش و رزرو'}</h2>
          <Link className="button secondary" href={partnership ? '/dashboard' : '/support'}>
            {partnership ? 'ثبت و مدیریت کافه' : 'گفت‌وگو با پشتیبانی'}
          </Link>
          <p>
            <Link className="text-link" href={partnership ? '/contact' : '/partnership'}>
              {partnership ? 'تماس با ما' : 'همکاری با ویتکو'}
            </Link>
          </p>
        </section>
      </div>
    </>
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
