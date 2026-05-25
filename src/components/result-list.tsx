import type { CompressionResult, InputFile } from "../shared/types";
import {
  formatPath,
  formatSize,
  getDisplayPath,
  getDisplaySize,
  getOriginalSize,
} from "../shared/format";

type Actions = {
  onOpenOutput?: (file: CompressionResult) => void;
  onRevealInFolder?: (file: CompressionResult) => void;
  onRetry?: (file: CompressionResult) => void | Promise<void>;
};

type Props = {
  items: (InputFile | CompressionResult)[];
  actions?: Actions;
};

function isResult(file: InputFile | CompressionResult): file is CompressionResult {
  return "status" in file;
}

export function ResultList({ items, actions }: Props) {
  return (
    <div class="stage-list">
      {items.map((file) => {
        const result = isResult(file) ? file : null;
        const failed = result?.status === "failed";
        const done = result?.status === "done" && typeof result.outputSize === "number";

        return (
          <article
            key={file.id}
            class={`stage-row ${failed ? "is-failed" : ""}`}
            title={failed ? result.error ?? "压缩失败" : undefined}
          >
            <div class="stage-main">
              <strong>{file.name}</strong>
              <span title={getDisplayPath(file)}>{formatPath(getDisplayPath(file))}</span>
            </div>
            <div class="stage-side">
              <em>{file.ext.replace(".", "").toUpperCase()}</em>
              <span class="stage-before">压缩前 {formatSize(getOriginalSize(file))}</span>
              {done ? (
                <strong class="stage-after">压缩后 {formatSize(getDisplaySize(file))}</strong>
              ) : failed ? (
                <strong class="stage-after is-failed">失败</strong>
              ) : (
                <strong class="stage-after is-pending">压缩后 待压缩</strong>
              )}
            </div>
            {actions && result && (done || failed) && (
              <div class="stage-actions">
                {done && actions.onOpenOutput && (
                  <button
                    class="row-action"
                    onClick={() => actions.onOpenOutput?.(result)}
                    title="打开输出文件"
                  >
                    打开
                  </button>
                )}
                {done && actions.onRevealInFolder && (
                  <button
                    class="row-action"
                    onClick={() => actions.onRevealInFolder?.(result)}
                    title="在 Finder 中显示"
                  >
                    Finder
                  </button>
                )}
                {failed && actions.onRetry && (
                  <button
                    class="row-action row-action-retry"
                    onClick={() => void actions.onRetry?.(result)}
                    title={result.error ?? "重试压缩"}
                  >
                    重试
                  </button>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
