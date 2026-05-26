import { useToast } from "../shared/toast";

type Props = {
  text: string;
  label?: string; // 默认"复制路径"
};

export function CopyPathButton({ text, label = "复制路径" }: Props) {
  const toast = useToast();

  const handleCopy = async () => {
    if (!text) return;
    const result = await window.simpleImage.core.clipboard.writeText(text);
    if (result?.ok) {
      toast.push({ type: "success", message: `路径已复制：${text}`, duration: 2000 });
    } else {
      toast.push({ type: "error", message: "复制失败", duration: 2500 });
    }
  };

  return (
    <button class="ghost-button" onClick={() => void handleCopy()} disabled={!text}>
      {label}
    </button>
  );
}
