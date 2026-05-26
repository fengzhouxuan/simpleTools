import { useEffect, useRef, useState } from "preact/hooks";

type Props = {
  // 要写入剪贴板的内容（通常是路径）
  text: string;
  label?: string; // 默认"复制路径"
};

export function CopyPathButton({ text, label = "复制路径" }: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  // unmount 时清 timer
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    if (!text) return;
    const result = await window.simpleImage.core.clipboard.writeText(text);
    if (result?.ok) {
      setCopied(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button class="ghost-button" onClick={() => void handleCopy()} disabled={!text}>
      {copied ? "✓ 已复制" : label}
    </button>
  );
}
