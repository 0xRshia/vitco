'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone-message" dir="rtl">
      <h1>مشکلی پیش آمده است</h1>
      <p>دریافت این صفحه انجام نشد. دوباره تلاش کنید.</p>
      <button className="button primary" onClick={reset}>
        تلاش دوباره
      </button>
    </main>
  );
}
