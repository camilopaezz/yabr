export type SettingsPanelProps = {
  visible: boolean;
};

export function SettingsPanel({ visible }: SettingsPanelProps) {
  if (!visible) return null;

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 8,
        border: "1px solid rgba(128, 128, 128, 0.3)",
      }}
    >
      <h3 style={{ margin: "0 0 12px" }}>Settings</h3>
      <p style={{ margin: 0, opacity: 0.7, fontSize: "0.9rem" }}>
        Execution provider override, output directory, and benchmark re-run will be available in a
        later phase.
      </p>
    </div>
  );
}
