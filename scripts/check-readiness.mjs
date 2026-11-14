// Configuration-only check. Never prints credentials or contacts a provider.
const production = process.argv.includes('--production');
const rows = [];
let failed = false;
function check(label, valid, detail) {
  rows.push(`${valid ? '✓' : '✗'} ${label}: ${detail}`);
  if (!valid) failed = true;
}
const configured = (key) => Boolean(process.env[key]?.trim());
function publicHttpsOrigin(value) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    if (
      parsed.origin !== value ||
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password
    )
      return false;
    if (
      !host.includes('.') ||
      host.startsWith('[') ||
      /(?:^|\.)(?:localhost|local|test|invalid|example)$/.test(host)
    )
      return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const [a, b] = host.split('.').map(Number);
      if (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
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

const paymentKeys = ['ZARINPAL_MERCHANT_ID', 'ZARINPAL_ENV', 'ZARINPAL_CAFE_IDS'];
const paymentValues = paymentKeys.map((key) => process.env[key] || '');
const paymentConfigured = paymentValues.some((value) => value.length > 0);
let paymentDetail = 'غیرفعال؛ پرداخت حضوری یا هنگام تحویل در دسترس است';
let validPayment = true;
if (paymentConfigured) {
  const [merchantId, environment, scope] = paymentValues;
  const cafeIds = scope.split(',');
  if (paymentValues.some((value) => !value || value !== value.trim())) {
    validPayment = false;
    paymentDetail =
      'تنظیمات ناقص یا دارای فاصله اضافی است؛ هر سه متغیر ZARINPAL_MERCHANT_ID و ZARINPAL_ENV و ZARINPAL_CAFE_IDS لازم‌اند';
  } else if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(merchantId)) {
    validPayment = false;
    paymentDetail = 'شناسه پذیرنده باید یک UUID کامل باشد؛ شناسه ناقص قابل استفاده نیست';
  } else if (!['live', 'sandbox'].includes(environment)) {
    validPayment = false;
    paymentDetail = 'محیط ZARINPAL_ENV باید به‌صراحت live یا sandbox باشد';
  } else if (
    scope !== '*' &&
    (!cafeIds.every((id) => /^[A-Za-z0-9_-]{1,100}$/.test(id)) ||
      new Set(cafeIds).size !== cafeIds.length)
  ) {
    validPayment = false;
    paymentDetail =
      'دامنه کافه‌ها باید * یا فهرست شناسه‌های یکتا با ویرگول و بدون فاصله یا مقدار خالی باشد';
  } else if (!origin || !validOrigin) {
    validPayment = false;
    paymentDetail = 'برای درگاه، APP_ORIGIN باید صریح و معتبر باشد';
  } else if (environment === 'live' && !publicHttpsOrigin(origin)) {
    validPayment = false;
    paymentDetail = 'پرداخت واقعی به APP_ORIGIN اصلی HTTPS با میزبان عمومی نیاز دارد';
  } else {
    paymentDetail =
      environment === 'sandbox'
        ? 'فقط محیط آزمایشی؛ هیچ پرداخت واقعی تأیید نشده است'
        : 'تنظیمات پرداخت واقعی موجود است؛ اعتبار پذیرنده، دامنه و تسویه هنوز باید جداگانه بررسی شود';
  }
}
check('درگاه زرین‌پال', validPayment, paymentDetail);

console.log(rows.join('\n'));
console.log('پایگاه داده: SQLite؛ انتشار نیازمند یک سرور با فضای ذخیره‌سازی پایدار است.');
console.log('این بررسی فقط تنظیمات را می‌سنجد؛ هیچ پیامک، ایمیل یا درخواست درگاهی ارسال نمی‌شود.');
process.exitCode = failed ? 1 : 0;
