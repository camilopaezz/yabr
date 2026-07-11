export function ask(_message: string, _options?: unknown): Promise<boolean> {
  return Promise.resolve(true);
}

export function open(_options?: unknown): Promise<string | null> {
  return Promise.resolve(null);
}

export function save(_options?: unknown): Promise<string | null> {
  return Promise.resolve(null);
}

export function message(_message: string, _options?: unknown): Promise<string> {
  return Promise.resolve("Ok");
}

export function confirm(_message: string, _options?: unknown): Promise<boolean> {
  return Promise.resolve(true);
}
