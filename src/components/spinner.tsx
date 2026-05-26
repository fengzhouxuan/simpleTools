// 轻量 CSS spinner，配合 "xxx 中..." 文字使用
export function Spinner({ inline = true }: { inline?: boolean }) {
  return <span class={`spinner ${inline ? "is-inline" : ""}`} aria-hidden="true" />;
}
