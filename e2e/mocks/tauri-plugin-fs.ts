import { getMockState } from "./mockState";

export function exists(_path: string): Promise<boolean> {
  return Promise.resolve(false);
}

export function readFile(_path: string): Promise<Uint8Array> {
  return Promise.resolve(getMockState().fixtureBytes);
}
