export type ProgressBarProps = {
  stage: string | null;
  progress: number;
};

export function ProgressBar({ stage, progress }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, progress));

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 4,
          fontSize: "0.85rem",
        }}
      >
        <span>{stage ?? "Processing"}</span>
        <span>{Math.round(clamped)}%</span>
      </div>
      <div
        style={{
          width: "100%",
          height: 8,
          backgroundColor: "rgba(128, 128, 128, 0.2)",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: "100%",
            backgroundColor: "#396cd8",
            transition: "width 0.2s ease",
          }}
        />
      </div>
    </div>
  );
}
