import { MODELS } from "../lib/models";
import { useSettingsStore } from "../stores/settingsStore";

export function ModeSelector() {
  const mode = useSettingsStore((state) => state.mode);
  const setMode = useSettingsStore((state) => state.setMode);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <h3 style={{ margin: 0, fontSize: "1rem" }}>Quality mode</h3>
      {MODELS.map((model) => (
        <label
          key={model.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: 8,
            borderRadius: 6,
            border: "1px solid rgba(128, 128, 128, 0.3)",
            opacity: model.available ? 1 : 0.5,
            cursor: model.available ? "pointer" : "not-allowed",
          }}
          title={
            model.available
              ? `${model.label} — ${model.inputSize}px`
              : `${model.label} — downloaded on first use`
          }
        >
          <input
            type="radio"
            name="mode"
            value={model.id}
            checked={mode === model.id}
            disabled={!model.available}
            onChange={() => model.available && setMode(model.id)}
          />
          <span style={{ flex: 1 }}>{model.label}</span>
          <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>
            {model.available ? "Available" : "Download on first use"}
          </span>
        </label>
      ))}
    </div>
  );
}
