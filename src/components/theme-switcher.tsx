import { useTheme, type ThemePref } from "../shared/theme";

const OPTIONS: { key: ThemePref; label: string; title: string }[] = [
  { key: "auto", label: "Auto", title: "跟随系统" },
  { key: "light", label: "Light", title: "强制亮色" },
  { key: "dark", label: "Dark", title: "强制暗色" },
];

export function ThemeSwitcher() {
  const { pref, setPref } = useTheme();

  return (
    <div class="theme-switcher" title="主题模式">
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          class={`theme-switcher-chip ${pref === o.key ? "is-active" : ""}`}
          onClick={() => setPref(o.key)}
          title={o.title}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
