export type ProgressBarProps = {
  stage: string | null;
  progress: number;
};

export function ProgressBar({ stage, progress }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, progress));

  return (
    <div className="progress-bar">
      <div className="progress-bar-meta">
        <span>{stage ?? "Processing"}</span>
        <span>{Math.round(clamped)}%</span>
      </div>
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
