// Configuration-only check. Never prints credentials or contacts a provider.
const production = process.argv.includes('--production');
const rows = [];
let failed = false;
function check(label, valid, detail) {
  rows.push(`${valid ? '✓' : '✗'} ${label}: ${detail}`);
  if (!valid) failed = true;
}
const configured = (key) => Boolean(process.env[key]?.trim());
const [major, minor] = process.versions.node.split('.').map(Number);
check(
  'نسخه Node.js',
  major > 22 || (major === 22 && minor >= 13),
  'حداقل نسخه مورد نیاز ۲۲٫۱۳ است',
);

const origin = process.env.APP_ORIGIN;
let validOrigin = !production && !origin;
if (origin) {
  try {
    const parsed = new URL(origin);
    validOrigin =
      ['http:', 'https:'].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password &&
      parsed.origin === origin &&
      (!production ||
        (parsed.protocol === 'https:' &&
          !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)));
  } catch {
    /* Invalid configuration is reported without echoing its value. */
  }
}
check(
  'نشانی برنامه',
  validOrigin,
  validOrigin
    ? origin
      ? 'تنظیم شده'
      : 'در حالت محلی از نشانی درخواست استفاده می‌شود'
    : production
      ? 'APP_ORIGIN باید نشانی اصلی HTTPS بدون مسیر یا اسلش پایانی باشد'
      : 'APP_ORIGIN باید یک نشانی HTTP یا HTTPS بدون مسیر یا اسلش پایانی باشد',
);

for (const [label, keys] of [
  ['ورود پیامکی کاوه‌نگار', ['KAVENEGAR_API_KEY', 'KAVENEGAR_TEMPLATE']],
  ['ایمیل بازیابی Resend', ['RESEND_API_KEY', 'MAIL_FROM']],
]) {
  const count = keys.filter(configured).length;
  const padded = keys.some(
    (key) => configured(key) && process.env[key] !== process.env[key].trim(),
  );
  check(
    label,
    (count === 0 || count === keys.length) && !padded,
    padded
      ? 'فاصله اضافی ابتدا یا انتهای تنظیمات را حذف کنید'
      : count === 0
        ? 'غیرفعال؛ اختیاری'
        : count === keys.length
          ? 'تنظیمات موجود است؛ اعتبار و تحویل واقعی هنوز باید بررسی شود'
          : `تنظیمات ناقص است؛ هر دو متغیر ${keys.join(' و ')} لازم‌اند`,
  );
}
const supportId = process.env.SUPPORT_USER_ID;
const validSupportId = !supportId || /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(supportId);
check(
  'حساب پشتیبانی سراسری',
  validSupportId,
  !validSupportId
    ? 'شناسه باید UUID یک حساب موجود باشد'
    : supportId
      ? 'شناسه تنظیم شده؛ وجود و مالکیت حساب باید جداگانه تأیید شود'
      : 'تنظیم نشده؛ اختیاری',
);

console.log(rows.join('\n'));
console.log('پرداخت: حضوری یا هنگام تحویل؛ درگاه آنلاین فعال نیست.');
console.log('پایگاه داده: SQLite؛ انتشار نیازمند یک سرور با فضای ذخیره‌سازی پایدار است.');
console.log('این بررسی فقط تنظیمات را می‌سنجد؛ هیچ پیامک یا ایمیلی ارسال نمی‌شود.');
process.exitCode = failed ? 1 : 0;
