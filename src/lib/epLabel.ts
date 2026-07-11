/** Map ORT execution provider ids to short chip labels. */
export function epLabel(ep: string | null | undefined): string {
  if (!ep) return "—";

  const normalized = ep.trim();
  switch (normalized) {
    case "CUDAExecutionProvider":
    case "cuda":
      return "CUDA";
    case "CPUExecutionProvider":
    case "cpu":
      return "CPU";
    case "DmlExecutionProvider":
    case "dml":
      return "DirectML";
    case "CoreMLExecutionProvider":
    case "coreml":
      return "CoreML";
    default:
      // Known short aliases above; unknown ids stay opaque as "—".
      return "—";
  }
}
