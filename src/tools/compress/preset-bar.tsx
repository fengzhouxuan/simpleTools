import { useCompressState } from "./state";
import { presets } from "./presets";

export function PresetBar() {
  const { state, applyPreset } = useCompressState();
  const isCustom = state.preset === "custom";

  return (
    <div class="preset-bar">
      <span class="preset-label">预设</span>
      <div class="preset-chips">
        {presets.map((p) => (
          <button
            key={p.key}
            class={`preset-chip ${state.preset === p.key ? "is-active" : ""}`}
            onClick={() => applyPreset(p.key)}
            title={p.description}
          >
            {p.label}
          </button>
        ))}
        {isCustom && <span class="preset-chip is-custom">自定义</span>}
      </div>
    </div>
  );
}
