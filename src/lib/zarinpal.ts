import { AppError, ensure, integer, text } from './validation';

export type ZarinpalConfig = {
  merchantId: string;
  origin: string;
  sandbox: boolean;
  cafeIds: string[] | '*';
};
export type ZarinpalPublicConfig = {
  available: boolean;
  cafe_ids: string[];
  all_cafes: boolean;
  sandbox: boolean;
};
export type ZarinpalTransport = (url: string, init: RequestInit) => Promise<Response>;
export type ZarinpalInquiryStatus = 'VERIFIED' | 'PAID' | 'IN_BANK' | 'FAILED' | 'REVERSED';

const merchantPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const scopePattern = /^[A-Za-z0-9_-]{1,100}$/;
const maxResponseBytes = 65536;
const maxAmountRial = 1000000000;
const timeoutMs = 15000;

function canonicalOrigin(value: string, sandbox: boolean) {
  try {
    const url = new URL(value);
    if (
      url.origin !== value ||
      url.username ||
      url.password ||
      !['http:', 'https:'].includes(url.protocol)
    )
      return false;
    if (sandbox) return true;
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    // A live terminal must point to its registered public site, never a local callback.
    if (
      !host.includes('.') ||
      host.startsWith('[') ||
      /(?:^|\.)(?:localhost|local|test|invalid|example)$/.test(host)
    )
      return false;
    const ip = host.split('.').map(Number);
    if (ip.length === 4 && ip.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      if (
        ip[0] === 0 ||
        ip[0] === 10 ||
        ip[0] === 127 ||
        ip[0] >= 224 ||
        (ip[0] === 169 && ip[1] === 254) ||
        (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31) ||
        (ip[0] === 192 && ip[1] === 168) ||
        (ip[0] === 100 && ip[1] >= 64 && ip[1] <= 127)
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Incomplete configuration always leaves online payment disabled. No default terminal or scope. */
export function getZarinpalConfig(): ZarinpalConfig | null {
  const merchantId = process.env.ZARINPAL_MERCHANT_ID || '';
  const environment = process.env.ZARINPAL_ENV || '';
  const scope = process.env.ZARINPAL_CAFE_IDS || '';
  const origin = process.env.APP_ORIGIN || '';
  if (!merchantPattern.test(merchantId) || !['live', 'sandbox'].includes(environment)) return null;
  const sandbox = environment === 'sandbox';
  if (!canonicalOrigin(origin, sandbox)) return null;
  if (scope === '*') return { merchantId, origin, sandbox, cafeIds: '*' };
  const cafeIds = scope.split(',');
  if (!cafeIds.every((id) => scopePattern.test(id)) || new Set(cafeIds).size !== cafeIds.length)
    return null;
  return { merchantId, origin, sandbox, cafeIds };
}
export function zarinpalPublicConfig(): ZarinpalPublicConfig {
  const config = getZarinpalConfig();
  return {
    available: Boolean(config),
    cafe_ids: config && config.cafeIds !== '*' ? config.cafeIds : [],
    all_cafes: config?.cafeIds === '*',
    sandbox: config?.sandbox || false,
  };
}
export function isCafeOnlinePayable(cafeId: string) {
  const config = getZarinpalConfig();
  return Boolean(config && (config.cafeIds === '*' || config.cafeIds.includes(cafeId)));
}

/** retryable signals an uncertain provider response; it never authorizes a new charge. */
export class ZarinpalError extends AppError {
  constructor(
    message: string,
    public readonly providerCode: number | null = null,
    public readonly retryable = false,
  ) {
    super(message, 502);
  }
}
function providerError(code: number | null): ZarinpalError {
  const messages: Record<number, string> = {
    [-9]: 'اطلاعات درخواست پرداخت از سوی درگاه پذیرفته نشد. با پشتیبانی تماس بگیرید.',
    [-10]: 'تنظیمات پذیرنده یا نشانی سرور درگاه معتبر نیست. با پشتیبانی تماس بگیرید.',
    [-11]: 'درگاه پذیرنده فعال نیست. با پشتیبانی تماس بگیرید.',
    [-12]: 'تعداد درخواست‌های درگاه زیاد است. کمی بعد وضعیت پرداخت را دوباره بررسی کنید.',
    [-13]: 'محدودیت تراکنش درگاه پذیرنده مانع پرداخت شد.',
    [-14]: 'دامنه بازگشت پرداخت با دامنه ثبت‌شده در زرین‌پال مطابقت ندارد.',
    [-15]: 'درگاه پذیرنده موقتاً تعلیق شده است.',
    [-41]: 'مبلغ سفارش از سقف پرداخت درگاه بیشتر است.',
    [-50]: 'مبلغ تراکنش با مبلغ ثبت‌شده سفارش مطابقت ندارد. با پشتیبانی تماس بگیرید.',
    [-51]: 'درگاه پرداخت این تراکنش را موفق اعلام نکرده است.',
    [-52]: 'بررسی پرداخت در درگاه انجام نشد. وضعیت را دوباره بررسی کنید.',
    [-53]: 'تراکنش به پذیرنده ثبت‌شده تعلق ندارد. با پشتیبانی تماس بگیرید.',
    [-54]: 'شناسه تراکنش در درگاه معتبر نیست.',
    [-55]: 'تراکنش در درگاه پیدا نشد. با پشتیبانی تماس بگیرید.',
  };
  return new ZarinpalError(
    code === null
      ? 'پاسخ معتبر از درگاه پرداخت دریافت نشد. وضعیت پرداخت را دوباره بررسی کنید.'
      : messages[code] || 'درگاه پرداخت درخواست را نپذیرفت. با پشتیبانی تماس بگیرید.',
    code,
    code === null || [-12, -52].includes(code),
  );
}
const providerBase = (sandbox: boolean) =>
  sandbox ? 'https://sandbox.zarinpal.com' : 'https://payment.zarinpal.com';
function validateCredentials(merchantId: string, sandbox: boolean) {
  ensure(
    merchantPattern.test(merchantId) && typeof sandbox === 'boolean',
    'تنظیمات درگاه پرداخت معتبر نیست.',
    503,
  );
}
function validateAmount(amountRial: number) {
  integer(amountRial, 'مبلغ پرداخت به ریال', 1, Number.MAX_SAFE_INTEGER);
  ensure(amountRial <= maxAmountRial, 'مبلغ پرداخت آنلاین نمی‌تواند بیش از صد میلیون تومان باشد.');
}
function validateAuthority(authority: string, sandbox: boolean) {
  ensure(
    typeof authority === 'string' &&
      (sandbox ? /^S[A-Za-z0-9]{35}$/ : /^A[A-Za-z0-9]{35}$/).test(authority),
    'شناسه تراکنش درگاه معتبر نیست.',
  );
}

// Preserve integer reference numbers before JSON.parse can round them. String tokens are
// copied intact; numeric JSON values become strings and are validated by each caller.
function parseProviderJson(raw: string): unknown {
  let normalized = '',
    index = 0;
  while (index < raw.length) {
    if (raw[index] === '"') {
      const start = index++;
      while (index < raw.length) {
        if (raw[index] === '\\') index += 2;
        else if (raw[index++] === '"') break;
      }
      normalized += raw.slice(start, index);
    } else if (/[-\d]/.test(raw[index])) {
      const token = raw.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)?.[0];
      if (!token) throw providerError(null);
      normalized += JSON.stringify(token);
      index += token.length;
    } else normalized += raw[index++];
  }
  return JSON.parse(normalized);
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
async function providerPost(
  sandbox: boolean,
  action: string,
  body: Record<string, unknown>,
  transport: ZarinpalTransport,
) {
  try {
    const response = await transport(providerBase(sandbox) + '/pg/v4/payment/' + action + '.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
      cache: 'no-store',
    });
    if (Number(response.headers.get('content-length') || 0) > maxResponseBytes)
      throw providerError(null);
    const raw = await response.text();
    if (Buffer.byteLength(raw, 'utf8') > maxResponseBytes) throw providerError(null);
    const payload = record(parseProviderJson(raw)),
      data = record(payload.data),
      errors = record(payload.errors);
    const code =
      typeof data.code === 'string' && /^-?\d+$/.test(data.code)
        ? Number(data.code)
        : typeof errors.code === 'string' && /^-?\d+$/.test(errors.code)
          ? Number(errors.code)
          : null;
    if (!response.ok || code === null || ![100, 101].includes(code))
      throw providerError(code !== null && code < 0 ? code : null);
    return { data, code };
  } catch (error) {
    if (error instanceof ZarinpalError) throw error;
    throw new ZarinpalError(
      'ارتباط مطمئن با درگاه پرداخت برقرار نشد. وضعیت پرداخت را دوباره بررسی کنید.',
      null,
      true,
    );
  }
}

export async function requestZarinpalPayment(
  input: {
    merchantId: string;
    sandbox: boolean;
    amountRial: number;
    callbackUrl: string;
    description: string;
    orderId: string;
  },
  transport: ZarinpalTransport = fetch,
): Promise<{ authority: string; url: string }> {
  validateCredentials(input.merchantId, input.sandbox);
  validateAmount(input.amountRial);
  const description = text(input.description, 'توضیحات پرداخت', 1, 500),
    orderId = text(input.orderId, 'سفارش', 1, 100);
  let callback: URL;
  try {
    callback = new URL(input.callbackUrl);
  } catch {
    throw new AppError('نشانی بازگشت پرداخت معتبر نیست.');
  }
  ensure(
    canonicalOrigin(callback.origin, input.sandbox) &&
      !callback.username &&
      !callback.password &&
      !callback.hash,
    'نشانی بازگشت پرداخت معتبر نیست.',
  );
  const { data, code } = await providerPost(
    input.sandbox,
    'request',
    {
      merchant_id: input.merchantId,
      amount: input.amountRial,
      currency: 'IRR',
      callback_url: callback.toString(),
      description,
      metadata: { order_id: orderId, auto_verify: false },
    },
    transport,
  );
  const authority = data.authority;
  if (
    code !== 100 ||
    typeof authority !== 'string' ||
    !(input.sandbox ? /^S[A-Za-z0-9]{35}$/ : /^A[A-Za-z0-9]{35}$/).test(authority)
  )
    throw providerError(null);
  return { authority, url: providerBase(input.sandbox) + '/pg/StartPay/' + authority };
}
export async function verifyZarinpalPayment(
  input: { merchantId: string; sandbox: boolean; amountRial: number; authority: string },
  transport: ZarinpalTransport = fetch,
): Promise<{ refId: string }> {
  validateCredentials(input.merchantId, input.sandbox);
  validateAmount(input.amountRial);
  validateAuthority(input.authority, input.sandbox);
  const { data } = await providerPost(
    input.sandbox,
    'verify',
    { merchant_id: input.merchantId, amount: input.amountRial, authority: input.authority },
    transport,
  );
  const refId = data.ref_id;
  if (typeof refId !== 'string' || !/^[1-9]\d{0,39}$/.test(refId)) throw providerError(null);
  return { refId };
}
/** Inquiry is advisory only: PAID/VERIFIED still require verify with the stored amount. */
export async function inquireZarinpalPayment(
  input: { merchantId: string; sandbox: boolean; authority: string },
  transport: ZarinpalTransport = fetch,
): Promise<{ status: ZarinpalInquiryStatus }> {
  validateCredentials(input.merchantId, input.sandbox);
  validateAuthority(input.authority, input.sandbox);
  const { data, code } = await providerPost(
    input.sandbox,
    'inquiry',
    { merchant_id: input.merchantId, authority: input.authority },
    transport,
  );
  if (
    code !== 100 ||
    typeof data.status !== 'string' ||
    !['VERIFIED', 'PAID', 'IN_BANK', 'FAILED', 'REVERSED'].includes(data.status)
  )
    throw providerError(null);
  return { status: data.status as ZarinpalInquiryStatus };
}
