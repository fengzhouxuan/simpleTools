import { useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";

function decodeFileUri(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("file://")) return null;
  try {
    return decodeURIComponent(trimmed.replace("file://", ""));
  } catch {
    return null;
  }
}

function extractDroppedPaths(event: DragEvent): string[] {
  const uriList = event.dataTransfer?.getData("text/uri-list") ?? "";
  const fromUriList = uriList
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map(decodeFileUri)
    .filter((value): value is string => Boolean(value));

  if (fromUriList.length > 0) return fromUriList;

  return Array.from(event.dataTransfer?.files ?? [])
    .map((file) => {
      const direct = (file as File & { path?: string }).path;
      if (direct) return direct;
      try {
        return window.simpleImage.core.webUtils.getPathForFile(file);
      } catch {
        return "";
      }
    })
    .filter((value): value is string => Boolean(value));
}

type Props = {
  empty: boolean;
  emptyTitle: string;
  emptyDefaultHint: string;
  onPathsDropped: (paths: string[]) => void;
  children?: ComponentChildren;
};

export function FileImportZone({
  empty,
  emptyTitle,
  emptyDefaultHint,
  onPathsDropped,
  children,
}: Props) {
  const [hint, setHint] = useState(emptyDefaultHint);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (empty) setHint(emptyDefaultHint);
  }, [empty, emptyDefaultHint]);

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
    setHint("检测到拖拽进入，松手即可导入");
  };

  const onDragOver = (e: DragEvent) => e.preventDefault();

  const onDragLeave = (e: DragEvent) => {
    if (e.currentTarget === e.target) {
      setIsDragOver(false);
      setHint(emptyDefaultHint);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const paths = extractDroppedPaths(e);
    setHint(
      paths.length > 0
        ? `已捕获 ${paths.length} 个拖入文件`
        : "收到了拖拽事件，但没有解析出本地文件路径",
    );
    if (paths.length > 0) {
      onPathsDropped(paths);
    }
  };

  return (
    <div
      class={`dropzone ${empty ? "empty-dropzone" : "filled-dropzone"} ${isDragOver ? "active" : ""}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {empty ? (
        <>
          <div class="drop-illustration" aria-hidden="true" />
          <strong>{emptyTitle}</strong>
          <span>{hint}</span>
        </>
      ) : (
        children
      )}
    </div>
  );
}
