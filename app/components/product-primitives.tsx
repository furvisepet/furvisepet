import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  FormEvent,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { getPetAccent } from "../lib/visual-system";

export type PageShellPreset = "app" | "reading" | "standard" | "today" | "wide" | "marketing";

export const pageShellClasses = {
  app: "",
  reading: "max-w-[1180px]",
  standard: "max-w-[1180px]",
  today: "max-w-[1180px]",
  wide: "max-w-[1180px]",
  marketing: "max-w-[1240px]",
} as const satisfies Record<PageShellPreset, string>;

export const pageShellGutters = "px-5 sm:px-8 lg:px-10 xl:px-12";
export const appPageContainer = "box-border mx-auto w-full max-w-[1180px] px-5 md:px-8 xl:px-12";
export const appPageContentClasses = {
  reading: "w-full",
  standard: "w-full",
  today: "w-full",
  wide: "w-full",
} as const;
export const focusedLayout = "w-full";
export const workspaceLayout = "w-full";
export const readingColumn = "w-full max-w-[760px]";
export const focusedFormLayout = "w-full max-w-[640px]";
export const todayPrimaryLayout = "w-full";

export function PageShell({
  children,
  className = "",
  preset = "standard",
}: {
  children: ReactNode;
  className?: string;
  preset?: PageShellPreset;
}) {
  if (preset === "app") return <div className={`${appPageContainer} ${className}`} data-page-shell={preset}>{children}</div>;
  const gutters = pageShellGutters;
  return <div className={`mx-auto w-full ${pageShellClasses[preset]} ${gutters} ${className}`} data-page-shell={preset}>{children}</div>;
}

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[var(--surface-page)] text-[var(--text-primary)]">{children}</div>;
}

export function PageHeader({
  actions,
  eyebrow,
  primaryAction,
  secondaryAction,
  title,
  supportingText,
  mobileTitleSize = "default",
}: {
  actions?: ReactNode;
  eyebrow?: ReactNode;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  title: ReactNode;
  supportingText?: ReactNode;
  mobileTitleSize?: "default" | "compact";
}) {
  const resolvedActions = actions ?? (primaryAction || secondaryAction ? <>{secondaryAction}{primaryAction}</> : null);
  const mobileTitleClass = mobileTitleSize === "compact" ? "text-[2.125rem]" : "text-[2.25rem]";
  return (
    <header className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" data-ui="page-header">
      <div className="min-w-0 max-w-[760px]">
        {eyebrow ? <p className="mb-2 text-sm font-medium text-[var(--text-secondary)]">{eyebrow}</p> : null}
        <h1 className={`${mobileTitleClass} font-bold leading-[1.08] tracking-[-0.035em] text-[var(--text-primary)] md:text-[2.625rem]`}>
          {title}
        </h1>
        {supportingText ? <p className="mt-2 max-w-[680px] text-base leading-7 text-[var(--text-secondary)] sm:mt-2.5 sm:text-lg">{supportingText}</p> : null}
      </div>
      {resolvedActions ? <div className="flex flex-wrap items-center gap-2 sm:justify-end" data-ui="page-header-actions">{resolvedActions}</div> : null}
    </header>
  );
}

export function Section({
  children,
  className = "",
  compact = false,
  title,
  supportingText,
}: {
  children: ReactNode;
  className?: string;
  compact?: boolean;
  title?: ReactNode;
  supportingText?: ReactNode;
}) {
  return (
    <section className={`${compact ? "py-5 sm:py-7" : "py-8 sm:py-10"} ${className}`}>
      {title ? <h2 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)] sm:text-2xl">{title}</h2> : null}
      {supportingText ? <p className="mt-2 max-w-[680px] leading-7 text-[var(--text-secondary)]">{supportingText}</p> : null}
      {children}
    </section>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <hr className={`border-0 border-t border-[var(--line)] ${className}`} />;
}

export type ButtonVariant = "primary" | "secondary" | "soft" | "ghost";
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: string;
  loading?: boolean;
};

export const textActionClass =
  "group inline-flex min-h-12 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-sm font-semibold text-[var(--ghost-action-text)] transition-colors hover:bg-[var(--ghost-action-hover)] hover:text-[var(--text-primary)] active:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]";

export const buttonVariantClasses = {
  primary: "bg-[var(--action-primary)] text-[var(--text-inverse)] shadow-[var(--shadow-surface-1)] hover:bg-[var(--action-primary-hover)] active:bg-[var(--action-primary-active)]",
  secondary: "border border-[var(--secondary-action-border)] bg-[var(--secondary-action)] text-[var(--secondary-action-text)] shadow-none hover:bg-[var(--secondary-action-hover)] active:bg-[var(--secondary-action-active)]",
  soft: "border border-[var(--border-subtle)] bg-[var(--soft-action)] text-[var(--soft-action-text)] shadow-none hover:border-[var(--border-strong)] hover:bg-[var(--soft-action-hover)] active:bg-[var(--soft-action-hover)]",
  ghost: "bg-transparent text-[var(--ghost-action-text)] shadow-none hover:bg-[var(--ghost-action-hover)] hover:text-[var(--text-primary)] active:bg-[var(--surface-hover)]",
} as const satisfies Record<ButtonVariant, string>;

export const buttonBaseClasses =
  "group relative inline-flex min-h-12 items-center justify-center rounded-full border border-transparent px-5 text-sm font-semibold leading-5 transition-[background-color,color,border-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:-translate-y-px active:translate-y-0 active:shadow-none focus-visible:outline-none disabled:cursor-not-allowed disabled:translate-y-0 disabled:border-[var(--border-subtle)] disabled:bg-[var(--disabled-surface)] disabled:text-[var(--disabled-text)] disabled:shadow-none disabled:hover:translate-y-0 aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:translate-y-0 aria-disabled:border-[var(--border-subtle)] aria-disabled:bg-[var(--disabled-surface)] aria-disabled:text-[var(--disabled-text)] aria-disabled:shadow-none";

export const buttonLabelVariantClasses = {
  primary: "text-[color:var(--text-inverse)]",
  secondary: "text-[color:var(--secondary-action-text)]",
  soft: "text-[color:var(--soft-action-text)]",
  ghost: "text-[color:var(--ghost-action-text)]",
} as const satisfies Record<ButtonVariant, string>;

export function Button({ children, className = "", href, loading = false, variant = "primary", ...buttonProps }: ButtonProps & { variant?: ButtonVariant }) {
  const classes = `${buttonBaseClasses} ${buttonVariantClasses[variant]} ${className}`;
  const unavailable = Boolean(buttonProps.disabled || loading);
  const labelClasses = `${buttonLabelVariantClasses[variant]} group-disabled:text-[color:var(--disabled-text)] group-aria-disabled:text-[color:var(--disabled-text)] ${loading ? "invisible" : ""}`;
  const content = <><span className={labelClasses} data-button-label>{children}</span>{loading ? <span aria-live="polite" className="absolute inset-0 inline-flex items-center justify-center text-[color:var(--disabled-text)]" role="status">Loading<span className="sr-only"> action</span></span> : null}</>;
  if (href) return <Link aria-disabled={unavailable || undefined} className={classes} data-button-variant={variant} href={href} onClick={unavailable ? (event) => event.preventDefault() : undefined} tabIndex={unavailable ? -1 : undefined}>{content}</Link>;
  return <button {...buttonProps} aria-busy={loading || undefined} className={classes} data-button-variant={variant} data-loading={loading || undefined} disabled={unavailable}>{content}</button>;
}

export function PrimaryButton(props: ButtonProps) {
  return <Button {...props} variant="primary" />;
}

export function SecondaryButton(props: ButtonProps) {
  return <Button {...props} variant="secondary" />;
}

export function SoftButton(props: ButtonProps) {
  return <Button {...props} variant="soft" />;
}

export function GhostButton(props: ButtonProps) {
  return <Button {...props} variant="ghost" />;
}

export function TextButton(props: ButtonProps) {
  return <GhostButton {...props} />;
}

export function ToggleButton({ children, className = "", pressed, tone = "normal", ...buttonProps }: ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean; tone?: "normal" | "warning" }) {
  const selectedClasses = tone === "warning"
    ? "border-[var(--warning-text)] bg-[var(--warning-surface)] font-semibold text-[var(--warning-text)] shadow-[inset_0_0_0_1px_var(--warning-text)]"
    : "border-[var(--border-strong)] bg-[var(--selected-background)] font-semibold text-[var(--deep-forest)] shadow-[inset_0_0_0_1px_var(--border-strong)]";
  return (
    <button
      {...buttonProps}
      aria-pressed={pressed}
      className={`inline-flex min-h-11 min-w-0 items-center justify-start gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-left text-sm leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${pressed ? selectedClasses : "border-[var(--border-subtle)] bg-[var(--surface-primary)] font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"} ${className}`}
      data-ui="toggle-button"
    >
      {pressed ? <span aria-hidden="true" className="shrink-0 font-bold">✓</span> : null}
      <span className="min-w-0 break-words">{children}</span>
    </button>
  );
}

export function TextAction({
  arrow = false,
  children,
  className = "",
  href,
  ...buttonProps
}: ButtonProps & { arrow?: boolean }) {
  const content = <>{children}{arrow ? <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span> : null}</>;
  const classes = `${textActionClass} ${className}`;
  if (href) return <Link className={classes} data-ui="text-action" href={href}>{content}</Link>;
  return <button className={classes} data-ui="text-action" {...buttonProps}>{content}</button>;
}

export const fieldControlClass =
  "min-h-[3.25rem] w-full rounded-[var(--radius-md)] border border-[var(--input-border)] bg-[var(--input-background)] px-4 text-base text-[var(--text-primary)] shadow-[inset_0_1px_0_var(--border-subtle)] outline-none transition-[border-color,background-color,box-shadow] placeholder:text-[var(--text-muted)] hover:border-[var(--border-strong)] focus:border-[var(--focus-ring)] focus:bg-[var(--surface-hover)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--focus-ring)_24%,transparent)] disabled:border-[var(--border-subtle)] disabled:bg-[var(--surface-primary)] disabled:text-[var(--disabled-text)] lg:min-h-12";

function FieldLabel({ children, hint, label }: { children: ReactNode; hint?: ReactNode; label: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
      <span>{label}</span>
      {children}
      {hint ? <span className="text-[0.8125rem] font-normal leading-5 text-[var(--text-muted)]">{hint}</span> : null}
    </label>
  );
}

export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <FieldLabel hint={hint} label={label}>
      <input className={fieldControlClass} {...props} />
    </FieldLabel>
  );
}

export function Select({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <FieldLabel label={label}>
      <select className={fieldControlClass} {...props}>{children}</select>
    </FieldLabel>
  );
}

export function TextareaField({ hint, label, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { hint?: ReactNode; label: ReactNode }) {
  return <FieldLabel hint={hint} label={label}><textarea className={`${fieldControlClass} min-h-32 resize-y py-3 leading-7`} {...props} /></FieldLabel>;
}

export function SearchField(props: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <Field {...props} type="search" />;
}

export function Choice({ label, type, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; type: "checkbox" | "radio" }) {
  return <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--ghost-action-hover)]"><input className="h-5 w-5 shrink-0" type={type} {...props} /><span>{label}</span></label>;
}

export function SegmentedControl({ children, label }: { children: ReactNode; label: string }) {
  return <div aria-label={label} className="inline-flex min-h-12 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-1 shadow-[var(--shadow-surface-1)]" role="group">{children}</div>;
}

export type CardVariant = "standard" | "interactive" | "highlight" | "pet" | "empty";

export function Card({ children, className = "", variant = "standard", ...props }: HTMLAttributes<HTMLElement> & { variant?: CardVariant }) {
  const variants = {
    standard: "bg-[var(--card-background)]",
    interactive: "cursor-pointer bg-[var(--surface-primary)] transition-[background-color,border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:shadow-[var(--shadow-surface-2)] active:translate-y-0 active:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]",
    highlight: "bg-[var(--surface-highlight)] shadow-[var(--shadow-surface-2)]",
    pet: "bg-[var(--pale-sage)] shadow-[var(--shadow-surface-2)]",
    empty: "bg-[var(--card-background)] py-9 sm:py-10",
  } as const;
  return <article className={`rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-5 shadow-[var(--shadow-surface-1)] sm:p-6 ${variants[variant]} ${className}`} data-card-variant={variant} {...props}>{children}</article>;
}

export type ChipVariant = "neutral" | "selected" | "category" | "status" | "removable";

export function Chip({ children, className = "", variant = "neutral", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ChipVariant }) {
  const variants = {
    neutral: "bg-[var(--chip-background)] text-[var(--text-secondary)]",
    selected: "border-[var(--sage)] bg-[var(--chip-selected-background)] text-[var(--chip-selected-foreground)]",
    category: "bg-[var(--surface-highlight)] text-[var(--text-primary)]",
    status: "bg-[var(--surface-raised)] text-[var(--text-secondary)]",
    removable: "bg-[var(--surface-raised)] text-[var(--text-primary)] after:ml-1 after:content-['×']",
  } as const;
  return <button className={`inline-flex min-h-11 items-center rounded-full border border-[var(--border-subtle)] px-3.5 py-1.5 text-[0.9375rem] font-semibold transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] focus-visible:outline-none disabled:bg-[var(--disabled-background)] disabled:text-[var(--disabled-text)] lg:min-h-9 lg:px-3 lg:text-sm ${variants[variant]} ${className}`} data-chip-variant={variant} type="button" {...props}>{children}</button>;
}

export function IconContainer({ children, className = "", size = "medium", tone = "sage" }: { children: ReactNode; className?: string; size?: "small" | "medium" | "large"; tone?: "sage" | "sky" | "apricot" | "lavender" | "yellow" | "rose" }) {
  const sizes = { small: "h-9 w-9 rounded-[var(--radius-sm)]", medium: "h-12 w-12 rounded-[var(--radius-md)]", large: "h-[4.25rem] w-[4.25rem] rounded-[var(--radius-lg)]" } as const;
  const tones = { sage: "[--icon-accent:var(--accent-sage)]", sky: "[--icon-accent:var(--accent-sky)]", apricot: "[--icon-accent:var(--accent-apricot)]", lavender: "[--icon-accent:var(--accent-lavender)]", yellow: "[--icon-accent:var(--accent-yellow)]", rose: "[--icon-accent:var(--accent-rose)]" } as const;
  return <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center bg-[color-mix(in_srgb,var(--icon-accent)_22%,var(--surface-raised))] text-[var(--text-primary)] shadow-[var(--shadow-surface-1)] ${tones[tone]} ${sizes[size]} ${className}`}>{children}</span>;
}

export function Dialog({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="fixed inset-0 z-[var(--z-dialog)] flex items-center justify-center bg-[var(--scrim)] p-4">
      <section aria-modal="true" className="w-full max-w-xl rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-overlay)] p-6 shadow-[var(--shadow-floating)] sm:p-8" role="dialog">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">{title}</h2>
        {children}
      </section>
    </div>
  );
}

export function Drawer({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="fixed inset-0 z-[var(--z-dialog)] flex justify-end bg-[var(--scrim)]">
      <aside aria-label={label} aria-modal="true" className="h-full w-full max-w-md overflow-y-auto bg-[var(--surface-overlay)] p-6 shadow-2xl" role="dialog">
        {children}
      </aside>
    </div>
  );
}

export function EmptyState({ action, className = "", description, title }: { action?: ReactNode; className?: string; description: ReactNode; title: string }) {
  return (
    <div className={`max-w-[680px] rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-primary)] px-6 py-9 shadow-[var(--shadow-surface-1)] sm:px-8 sm:py-10 ${className}`} data-card-variant="empty">
      <h2 className="text-[1.35rem] font-semibold tracking-[-0.015em] text-[var(--text-primary)]">{title}</h2>
      <p className="mt-2 max-w-[560px] text-[1.02rem] leading-7 text-[var(--text-secondary)]">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Timeline({ children, label = "Timeline" }: { children: ReactNode; label?: string }) {
  return <ol aria-label={label} className="relative ml-2 border-l border-[var(--line)]">{children}</ol>;
}

export function TimelineItem({ children, date, active = false }: { active?: boolean; children: ReactNode; date: ReactNode }) {
  return (
    <li className="relative pb-8 pl-7 last:pb-0">
      <span aria-hidden="true" className={`absolute -left-[5px] top-1 h-[9px] w-[9px] rounded-full ${active ? "bg-[var(--action-primary)]" : "bg-[var(--line-strong)]"}`} />
      <p className="text-xs font-medium text-[var(--text-tertiary)]">{date}</p>
      <div className="mt-1 text-[var(--text-primary)]">{children}</div>
    </li>
  );
}

export function PetAvatar({ className = "", name, photoUrl, size = "medium" }: { className?: string; name: string; photoUrl?: string | null; size?: "small" | "medium" | "large" }) {
  const sizes = { small: "h-9 w-9 rounded-xl text-sm", medium: "h-12 w-12 rounded-2xl text-base", large: "h-[4.5rem] w-[4.5rem] rounded-[1.4rem] text-xl" } as const;
  const style = { "--pet-accent": getPetAccent(name) } as React.CSSProperties;
  return (
    <span aria-label={`${name} avatar`} className={`${sizes[size]} inline-flex shrink-0 items-center justify-center overflow-hidden border border-[color-mix(in_srgb,var(--pet-accent)_52%,var(--border-subtle))] bg-[color-mix(in_srgb,var(--pet-accent)_24%,var(--surface-raised))] font-bold text-[var(--text-primary)] shadow-[var(--shadow-surface-1)] ${className}`} role="img" style={style}>
      {photoUrl ? (
        // Pet photos can be user-provided Supabase URLs, so the shared avatar preserves the existing source directly.
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="h-full w-full object-cover" src={photoUrl} />
      ) : name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

export function PetIdentity({ detail, name, photoUrl, size = "default" }: { detail?: ReactNode; name: string; photoUrl?: string | null; size?: "default" | "large" }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PetAvatar name={name} photoUrl={photoUrl} size={size === "large" ? "medium" : "small"} />
      <div className="min-w-0">
        <p className={`${size === "large" ? "text-xl" : "text-sm"} truncate font-semibold text-[var(--text-primary)]`}>{name}</p>
        {detail ? <p className="mt-0.5 truncate text-sm text-[var(--text-secondary)]">{detail}</p> : null}
      </div>
    </div>
  );
}

export function Composer({
  label,
  onSubmit,
  submitLabel,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; submitLabel: string }) {
  return (
    <form className="rounded-[var(--radius-lg)] border border-[var(--input-border)] bg-[var(--input-background)] p-3 shadow-[var(--shadow-surface-2)] transition-[border-color,box-shadow] focus-within:border-[var(--focus-ring)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--focus-ring)_24%,transparent),var(--shadow-surface-2)]" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor={props.id}>{label}</label>
      <textarea className="min-h-24 w-full resize-none bg-transparent px-2 py-1 text-base leading-7 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]" {...props} />
      <div className="mt-2 flex justify-end"><PrimaryButton disabled={props.disabled} type="submit">{submitLabel}</PrimaryButton></div>
    </form>
  );
}

export function Notice({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warning" | "danger" }) {
  const tones = {
    neutral: "border-[var(--line)] text-[var(--text-secondary)]",
    warning: "border-[var(--warning-text)] text-[var(--warning-text)]",
    danger: "border-[var(--danger-text)] text-[var(--danger-text)]",
  } as const;
  return <div className={`border-y px-1 py-3 text-sm leading-6 ${tones[tone]}`} role="status">{children}</div>;
}

export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 z-[var(--z-sticky-controls)] mt-8 border-t border-[var(--line)] bg-[var(--surface-page)] py-3"><div className="flex flex-wrap items-center justify-end gap-2">{children}</div></div>;
}

export function DocumentStatus({ status }: { status: "Draft" | "Confirmed" | "New version in progress" }) {
  return <span className="inline-flex min-h-8 items-center rounded-full border border-[var(--line-strong)] px-3 text-xs font-semibold text-[var(--text-secondary)]">{status}</span>;
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div aria-label={label} className="max-w-[620px] animate-pulse py-8" role="status">
      <span className="sr-only">{label}</span>
      <div className="h-3 w-28 rounded-full bg-[var(--line)]" />
      <div className="mt-4 h-3 w-full rounded-full bg-[var(--line)]" />
      <div className="mt-2 h-3 w-3/4 rounded-full bg-[var(--line)]" />
    </div>
  );
}
