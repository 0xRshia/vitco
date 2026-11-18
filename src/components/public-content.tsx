'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, useApp, useResource } from '@/lib/client';
import { dateLabel } from '@/lib/format';
import type { Article, Testimonial } from '@/lib/platform';
import { Empty, ErrorBox, Field, Form, Loading, Media, PageTitle, SectionTitle } from './ui';

export function BlogView({ id }: { id?: string }) {
  const [category, setCategory] = useState('');
  const resource = useResource<{
    article?: Article;
    articles?: Omit<Article, 'body'>[];
    categories?: string[];
  }>(id ? 'blog/' + id : 'blog' + (category ? '?category=' + encodeURIComponent(category) : ''));
  if (resource.error) return <ErrorBox message={resource.error} retry={resource.reload} />;
  if (id) {
    const article = resource.data?.article;
    if (!article) return <Loading />;
    return (
      <>
        <PageTitle
          title={article.title}
          description={article.category + ' · ' + dateLabel(article.updated_at)}
          back="/blog"
        />
        <article className="panel prose">
          {article.image && (
            <Media src={article.image} alt={article.title} className="service-article-image" />
          )}
          <p>
            <strong>{article.summary}</strong>
          </p>
          <p className="service-body">{article.body}</p>
        </article>
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
            <article key={article.slug} className="panel">
              {article.image && <Media src={article.image} alt={article.title} />}
              <p className="muted">
                {article.category} · {dateLabel(article.updated_at)}
              </p>
              <h2>
                <Link href={'/blog/' + encodeURIComponent(article.slug)}>{article.title}</Link>
              </h2>
              <p>{article.summary}</p>
              <Link href={'/blog/' + encodeURIComponent(article.slug)} className="text-link">
                خواندن نوشته
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="نوشته‌ای در این بخش منتشر نشده است." />
      )}
    </>
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
