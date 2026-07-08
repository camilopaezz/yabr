export async function shouldProceedWithOverwrite(
  outputPath: string,
  exists: (path: string) => Promise<boolean>,
  ask: (message: string) => Promise<boolean>,
): Promise<boolean> {
  const fileExists = await exists(outputPath);
  if (!fileExists) {
    return true;
  }
  return await ask(`${outputPath} already exists. Overwrite?`);
}
