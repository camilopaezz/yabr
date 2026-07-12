/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_E2E?: string;
}

interface Window {
  __swiftmaskInjectDrop?: (paths: string[]) => void;
}
