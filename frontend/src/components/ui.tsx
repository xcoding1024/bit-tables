import { useEffect, type ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Btn({
  variant = "ghost",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const tone =
    variant === "primary"
      ? "bg-accent text-accent-fg hover:bg-accent-hover"
      : variant === "danger"
        ? "border-line text-danger hover:bg-hover"
        : "border-line text-secondary hover:bg-hover";
  return (
    <button
      type="button"
      className={`h-7 rounded px-2 disabled:opacity-60 ${variant === "primary" ? "" : "border"} ${tone} ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-3 block">
      <div className="mb-1 text-muted">{label}</div>
      {children}
      {hint ? <div className="mt-1 text-muted">{hint}</div> : null}
    </div>
  );
}

const control =
  "h-8 w-full rounded border border-line bg-bg px-2 text-ink outline-none focus:border-line-strong disabled:opacity-60";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${control} ${props.className ?? ""}`} {...props} />;
}

export function Dialog({
  open,
  title,
  children,
  footer,
  onClose,
  width = "max-w-[480px]",
  bodyClassName = "overflow-auto",
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  width?: string;
  bodyClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <button type="button" className="absolute inset-0" aria-label="关闭" onClick={onClose} />
      <div className={`relative w-full ${width} rounded border border-line bg-elevated`}>
        <div className="flex h-9 items-center border-b border-line px-3 font-medium">{title}</div>
        <div className={`max-h-[70vh] p-3 ${bodyClassName}`}>{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-line px-3 py-2">{footer}</div> : null}
      </div>
    </div>
  );
}
