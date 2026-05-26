import { createContext } from "preact";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "preact/hooks";
import type { ComponentChildren } from "preact";

export type ToastType = "info" | "success" | "warning" | "error";

export type ToastInput = {
  type?: ToastType;
  message: string;
  // duration ms，0 = 不自动消失，默认 2500ms
  duration?: number;
};

type Toast = ToastInput & {
  id: number;
  type: ToastType;
  duration: number;
};

type ToastContextValue = {
  push: (toast: ToastInput) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

const TYPE_ICON: Record<ToastType, string> = {
  info: "i",
  success: "✓",
  warning: "⚠",
  error: "✕",
};

export function ToastProvider({ children }: { children: ComponentChildren }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = nextId++;
      const t: Toast = {
        ...input,
        id,
        type: input.type ?? "info",
        duration: input.duration ?? 2500,
      };
      setToasts((prev) => [...prev, t]);
      if (t.duration > 0) {
        window.setTimeout(() => dismiss(id), t.duration);
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div class="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [leaving, setLeaving] = useState(false);

  // 在被定时移除前提前触发 leave 动画（不影响真实移除时机，纯视觉）
  useEffect(() => {
    if (toast.duration <= 0) return;
    const t = window.setTimeout(
      () => setLeaving(true),
      Math.max(0, toast.duration - 200),
    );
    return () => window.clearTimeout(t);
  }, [toast.duration]);

  return (
    <div class={`toast toast-${toast.type} ${leaving ? "is-leaving" : ""}`}>
      <span class="toast-icon" aria-hidden="true">
        {TYPE_ICON[toast.type]}
      </span>
      <span class="toast-message">{toast.message}</span>
      <button
        class="toast-close"
        onClick={() => onDismiss(toast.id)}
        aria-label="关闭"
      >
        ×
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const v = useContext(ToastContext);
  if (!v) throw new Error("useToast must be inside ToastProvider");
  return v;
}
