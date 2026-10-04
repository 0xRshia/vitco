'use client';
import Link from 'next/link';
import {
  useEffect,
  useRef,
  type ReactNode,
  type ReactElement,
  type FormEvent,
  useState,
  useId,
  Children,
  isValidElement,
  cloneElement,
} from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Coffee,
  X,
  Plus,
  Minus,
  AlertCircle,
  LoaderCircle,
  Store,
  ImageOff,
} from 'lucide-react';
import { digits, statusLabels } from '@/lib/format';
import { useApp } from '@/lib/client';

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link href="/" className={'brand ' + (small ? 'small' : '')} aria-label="ویترین کافه، خانه">
      <span className="brand-mark">
        <Coffee size={small ? 22 : 26} strokeWidth={1.8} />
      </span>
      <span>
        <strong>
          ویترین کافه<span className="brand-dot">.</span>
        </strong>
        {!small && <small>قرارِ لحظه‌های خوب</small>}
      </span>
    </Link>
  );
}
export function PageTitle({
  title,
  description,
  action,
  back,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  back?: string;
}) {
  return (
    <div className="page-title">
      <div>
        {back && (
          <Link className="back-link" href={back}>
            <ChevronRight size={16} /> بازگشت
          </Link>
        )}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function SectionTitle({
  title,
  description,
  href,
  label = 'مشاهده همه',
}: {
  title: string;
  description?: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {href && (
        <Link href={href}>
          {label}
          <ArrowLeft size={16} />
        </Link>
      )}
    </div>
  );
}
export function Empty({
  title,
  description,
  href,
  label,
  icon = 'coffee',
}: {
  title: string;
  description: string;
  href?: string;
  label?: string;
  icon?: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        {icon === 'store' ? <Store size={32} /> : <Coffee size={32} />}
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {href && (
        <Link className="button primary" href={href}>
          {label || 'مشاهده کافه‌ها'}
          <ArrowLeft size={16} />
        </Link>
      )}
    </div>
  );
}
export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={20} />
      <span>{message}</span>
      {retry && <button onClick={retry}>تلاش دوباره</button>}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={28} />
      <span>در حال دریافت اطلاعات…</span>
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  let labelled = false;
  function connect(nodes: ReactNode): ReactNode {
    return Children.map(nodes, (node) => {
      if (!isValidElement(node)) return node;
      const element = node as ReactElement<{
        children?: ReactNode;
        type?: string;
        id?: string;
        'aria-labelledby'?: string;
        'aria-describedby'?: string;
      }>;
      if (
        !labelled &&
        typeof element.type === 'string' &&
        ['input', 'select', 'textarea'].includes(element.type) &&
        element.props.type !== 'hidden'
      ) {
        labelled = true;
        return cloneElement(element, {
          id,
          'aria-labelledby': id + '-label',
          'aria-describedby': hint ? id + '-hint' : undefined,
        });
      }
      return element.props.children
        ? cloneElement(element, { children: connect(element.props.children) })
        : element;
    });
  }
  const controls = connect(children);
  return (
    <div
      className="field"
      role={labelled ? undefined : 'group'}
      aria-labelledby={labelled ? undefined : id + '-label'}
    >
      <label id={id + '-label'} htmlFor={labelled ? id : undefined}>
        {label}
      </label>
      {controls}
      {hint && <small id={id + '-hint'}>{hint}</small>}
    </div>
  );
}
export function Submit({ busy, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <button className="button primary" type="submit" disabled={busy}>
      {busy ? (
        <>
          <LoaderCircle size={18} className="spin" />
          در حال انجام…
        </>
      ) : (
        children
      )}
    </button>
  );
}
export function Form({
  onSubmit,
  children,
  className = '',
}: {
  onSubmit: (data: FormData) => Promise<void>;
  children: ReactNode;
  className?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit(new FormData(e.currentTarget));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'عملیات انجام نشد.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={'form ' + className} onSubmit={submit} noValidate>
      <fieldset disabled={busy}>
        {children}
        {error && <ErrorBox message={error} />}
        <Submit busy={busy}>
          ذخیره و ادامه
          <ArrowLeft size={17} />
        </Submit>
      </fieldset>
    </form>
  );
}
export function Quantity({
  value,
  onChange,
  min = 1,
  max = 20,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="quantity">
      <button
        aria-label="افزایش تعداد"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        type="button"
      >
        <Plus size={17} />
      </button>
      <span>{digits(value)}</span>
      <button
        aria-label="کاهش تعداد"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        type="button"
      >
        <Minus size={17} />
      </button>
    </div>
  );
}
export function Badge({ status }: { status: string }) {
  return <span className={'badge status-' + status}>{statusLabels[status] || status}</span>;
}
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    else if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="بستن" onClick={onClose}>
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function LoginGate({ children }: { children: ReactNode }) {
  const { data, loading } = useApp();
  if (loading) return <Loading />;
  if (!data?.user)
    return (
      <Empty
        title="جای شما در ویترین خالی است"
        description="برای دیدن این بخش وارد حساب خود شوید. قرارهای خوب از همین‌جا شروع می‌شوند."
        href="/login"
        label="ورود یا ساخت حساب"
      />
    );
  return <>{children}</>;
}
export function Media({
  src,
  alt,
  kind = 'coffee',
  className = '',
}: {
  src?: string;
  alt: string;
  kind?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div className={'media ' + className}>
      {src && !failed ? (
        <img src={src} alt={alt} onError={() => setFailed(true)} />
      ) : (
        <div className="no-photo">
          {kind === 'store' ? (
            <Store size={40} strokeWidth={1.1} />
          ) : (
            <Coffee size={40} strokeWidth={1.1} />
          )}
          <small>
            {failed ? (
              <>
                <ImageOff size={12} /> تصویر در دسترس نیست
              </>
            ) : (
              'تصویری ثبت نشده است'
            )}
          </small>
        </div>
      )}
    </div>
  );
}
export function Confirm({
  open,
  title,
  description,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="muted">{description}</p>
      <div className="button-row">
        <button className="button danger" onClick={onConfirm}>
          بله، ادامه بده
        </button>
        <button className="button secondary" onClick={onClose}>
          انصراف
        </button>
      </div>
    </Modal>
  );
}
