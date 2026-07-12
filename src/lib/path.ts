export function deriveOutputPath(
  inputPath: string,
  outputDir: string | null,
  modelId: string,
): string {
  const lastSep = Math.max(
    inputPath.lastIndexOf("/"),
    inputPath.lastIndexOf("\\"),
  );
  const dir = outputDir ?? (lastSep >= 0 ? inputPath.slice(0, lastSep) : ".");
  const file = lastSep >= 0 ? inputPath.slice(lastSep + 1) : inputPath;
  const dot = file.lastIndexOf(".");
  const stem = dot >= 0 ? file.slice(0, dot) : file;
  return `${dir.replace(/[\\/]+$/, "")}/${stem}-nobg-${modelId}.png`;
}
