/** Map backend EP ids (`cpu`/`cuda`/`directml`) to short chip labels. */
export function epLabel(ep: string | null | undefined): string {
  if (!ep) return "—";

  switch (ep.trim().toLowerCase()) {
    case "cudaexecutionprovider":
    case "cuda":
      return "CUDA";
    case "cpuexecutionprovider":
    case "cpu":
      return "CPU";
    case "dmlexecutionprovider":
    case "dml":
    case "directml":
      return "DirectML";
    case "coremlexecutionprovider":
    case "coreml":
      return "CoreML";
    default:
      return "—";
  }
}
