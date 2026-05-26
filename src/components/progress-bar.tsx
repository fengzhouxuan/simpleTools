import type { TaskProgress } from "../shared/types";

type Props = {
  progress: TaskProgress | null;
  // 任务名（"压缩" / "导出" 等），显示在前缀
  taskLabel?: string;
};

export function ProgressBar({ progress, taskLabel }: Props) {
  if (!progress) return null;
  const { current, total, stage } = progress;
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <div class="progress-bar">
      <div class="progress-bar-track">
        <div class="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div class="progress-bar-meta">
        <span class="progress-bar-stage" title={stage}>
          {taskLabel ? `${taskLabel}：` : ""}
          {stage}
        </span>
        <span class="progress-bar-count">
          {current} / {total} · {pct}%
        </span>
      </div>
    </div>
  );
}
