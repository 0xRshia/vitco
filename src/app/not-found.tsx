import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="standalone-message" dir="rtl">
      <h1>این مسیر به کافه نمی‌رسد!</h1>
      <p>صفحه‌ای که دنبالش هستید پیدا نشد.</p>
      <Link className="button primary" href="/">
        بازگشت به خانه
      </Link>
    </main>
  );
}
