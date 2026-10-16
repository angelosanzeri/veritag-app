/**
 * Veritag UI kit — small, accessible building blocks on the design tokens.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check as CheckIcon, CheckCircle2, ImagePlus, Info, Trash2, X, XCircle } from "lucide-react";

import { artGradient, initials } from "../lib/format.js";
import { imageToDataUrl } from "../lib/images.js";
import { useI18n } from "../lib/i18n.js";

// ── buttons ─────────────────────────────────────────────────────────────
type BtnVariant = "primary" | "ghost" | "quiet" | "danger" | "gold";
export function Button({
  variant = "primary",
  size,
  block,
  icon,
  busy,
  children,
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: "sm" | "lg";
  block?: boolean;
  icon?: ReactNode;
  busy?: boolean;
}) {
  const cls = ["btn", `btn-${variant}`, size && `btn-${size}`, block && "btn-block", !children && "btn-icon", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={cls} disabled={rest.disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? <span className="spinner" aria-hidden /> : icon}
      {children}
    </button>
  );
}

// ── fields ──────────────────────────────────────────────────────────────
export function Field({ label, hint, children, className = "" }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`field ${className}`}>
      {label && <label>{label}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode }) {
  const { label, hint, className = "", ...rest } = props;
  const id = useId();
  const el = <input id={id} className={`input ${className}`} {...rest} />;
  if (!label && !hint) return el;
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      {el}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode }) {
  const { label, hint, className = "", ...rest } = props;
  const id = useId();
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      <textarea id={id} className={`textarea ${className}`} {...rest} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; hint?: ReactNode }) {
  const { label, hint, className = "", children, ...rest } = props;
  const id = useId();
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      <select id={id} className={`select ${className}`} {...rest}>
        {children}
      </select>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Switch({ checked, onChange, title, sub }: { checked: boolean; onChange: (v: boolean) => void; title: ReactNode; sub?: ReactNode }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      <span className="switch-text">
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </span>
    </label>
  );
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  block,
}: {
  value: T;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  onChange: (v: T) => void;
  block?: boolean;
}) {
  return (
    <div className={`seg${block ? " block" : ""}`} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Choices<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; title: ReactNode; sub?: ReactNode; icon?: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="choices" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} className={`choice${value === o.value ? " on" : ""}`} onClick={() => onChange(o.value)}>
          {o.icon}
          <div>
            <b>{o.title}</b>
            {o.sub && <span>{o.sub}</span>}
          </div>
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: { value: T; label: ReactNode; icon?: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} className={value === t.value ? "on" : ""} onClick={() => onChange(t.value)}>
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Six boxes for the blue-check code — paste-aware, arrow-key friendly. */
export function OtpInput({ value, onChange, length = 6, onComplete }: { value: string; onChange: (v: string) => void; length?: number; onComplete?: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const set = (v: string) => {
    const clean = v.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    refs.current[Math.min(clean.length, length - 1)]?.focus();
  };
  return (
    <div className="otp">
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`${i + 1}`}
          maxLength={length}
          value={value[i] ?? ""}
          onChange={(e) => {
            const typed = e.target.value.replace(/\D/g, "");
            if (typed.length > 1) set(value.slice(0, i) + typed);
            else set((value.slice(0, i) + typed + value.slice(i + 1)).slice(0, length));
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !value[i] && i > 0) {
              e.preventDefault();
              onChange(value.slice(0, i - 1));
              refs.current[i - 1]?.focus();
            } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            else if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
          }}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}

// ── identity ────────────────────────────────────────────────────────────
export function BlueCheck({ lg, title }: { lg?: boolean; title?: string }) {
  return (
    <span className={`check${lg ? " lg" : ""}`} title={title} aria-label={title}>
      <CheckIcon />
    </span>
  );
}

export function Avatar({ name, src, size = 40, square }: { name: string; src?: string; size?: number; square?: boolean }) {
  return (
    <span className={`avatar${square ? " sq" : ""}`} style={{ ["--s" as string]: `${size}px` }}>
      {src ? <img src={src} alt="" loading="lazy" decoding="async" /> : initials(name)}
    </span>
  );
}

export function ArtImage({ src, seed, alt = "", className = "", style }: { src?: string; seed: string; alt?: string; className?: string; style?: React.CSSProperties }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`art ${className}`} style={style}>
      <div className="art-fallback" style={{ background: artGradient(seed) }} />
      {src && !failed && <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} style={{ position: "relative" }} />}
    </div>
  );
}

export function Mark({ size = 34, word = true }: { size?: number; word?: boolean }) {
  return (
    <span className="mark">
      <img src="/mark.svg" alt="" style={{ width: size, height: size }} />
      {word && <span>Veritag</span>}
    </span>
  );
}

// ── feedback ────────────────────────────────────────────────────────────
export function Badge({ tone, icon, children }: { tone?: "green" | "amber" | "red" | "trust" | "violet" | "gold"; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`badge${tone ? ` ${tone}` : ""}`}>
      {icon}
      {children}
    </span>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "error" | "ok" | "warn"; title?: ReactNode; children?: ReactNode }) {
  const Icon = tone === "error" ? XCircle : tone === "ok" ? CheckCircle2 : tone === "warn" ? AlertTriangle : Info;
  return (
    <div className={`notice ${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon />
      <div>
        {title && <b>{title}</b>}
        {children && <div className="notice-body">{children}</div>}
      </div>
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-ic">{icon}</div>
      <b>{title}</b>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function Skeleton({ w = "100%", h = 16, r, style }: { w?: number | string; h?: number | string; r?: number; style?: React.CSSProperties }) {
  return <div className="skel" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

// toasts: a global store, rendered once by <Toaster/>
type ToastT = { id: number; text: string; kind: "ok" | "err" };
let toasts: ToastT[] = [];
const toastSubs = new Set<() => void>();
let toastSeq = 0;
export function toast(text: string, kind: "ok" | "err" = "ok") {
  const t = { id: ++toastSeq, text, kind };
  toasts = [...toasts, t].slice(-3);
  toastSubs.forEach((s) => s());
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    toastSubs.forEach((s) => s());
  }, 3200);
}
export function Toaster() {
  const list = useSyncExternalStore(
    (cb) => {
      toastSubs.add(cb);
      return () => toastSubs.delete(cb);
    },
    () => toasts,
  );
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.kind === "ok" ? <CheckCircle2 /> : <XCircle />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

// ── sheet (modal on desktop, bottom sheet on phones) ───────────────────
export function Sheet({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("input, textarea, select, button:not(.sheet-x)")?.focus());
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet${wide ? " wide" : ""}`} role="dialog" aria-modal="true" ref={ref}>
        <div className="sheet-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3>{title}</h3>
            {sub && <p>{sub}</p>}
          </div>
          <Button className="sheet-x" variant="quiet" size="sm" icon={<X />} onClick={onClose} aria-label={t("Chiudi", "Close")} />
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ── image picker (downscales before upload) ─────────────────────────────
export function ImagePicker({
  value,
  onChange,
  maxKB = 380,
  maxSide = 1600,
  aspect = "4 / 3",
  round,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  maxKB?: number;
  maxSide?: number;
  aspect?: string;
  round?: boolean;
  label?: ReactNode;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      onChange(await imageToDataUrl(f, { maxKB, maxSide }));
    } catch {
      toast(t("Immagine non leggibile o troppo grande.", "Image unreadable or too large."), "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="field">
      {label && <label>{label}</label>}
      <div className={`img-pick${round ? " round" : ""}`} style={{ aspectRatio: round ? "1" : aspect }}>
        {value && <img src={value} alt="" />}
        {!value && (
          <div className="img-pick-empty">
            {busy ? <span className="spinner" /> : <ImagePlus />}
            <span>{t("Trascina o scegli un'immagine", "Drop or choose an image")}</span>
          </div>
        )}
        <input type="file" accept="image/*" onChange={pick} aria-label={t("Scegli immagine", "Choose image")} />
        {value && !round && (
          <div className="img-pick-actions">
            <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => onChange("")} aria-label={t("Rimuovi", "Remove")} />
          </div>
        )}
      </div>
      {value && round && (
        <button className="btn btn-quiet btn-sm" style={{ alignSelf: "center" }} onClick={() => onChange("")}>
          {t("Rimuovi foto", "Remove photo")}
        </button>
      )}
    </div>
  );
}

// ── data viz ────────────────────────────────────────────────────────────
export function Kpi({ icon, tone, label, value, sub }: { icon: ReactNode; tone?: "green" | "gold" | "trust" | "amber"; label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="kpi">
      <div className="kpi-top">
        <span className={`kpi-ic${tone ? ` ${tone}` : ""}`}>{icon}</span>
        {label}
      </div>
      <div className="kpi-val">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function Bars({ data, label }: { data: { key: string; value: number; tip: string }[]; label: (i: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <div className="bars" role="img">
        {data.map((d) => (
          <div key={d.key} className={`bar${d.value ? "" : " zero"}`} style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}>
            <span className="tip">{d.tip}</span>
          </div>
        ))}
      </div>
      <div className="bars-axis">
        <span>{label(0)}</span>
        <span>{label(Math.floor((data.length - 1) / 2))}</span>
        <span>{label(data.length - 1)}</span>
      </div>
    </div>
  );
}
