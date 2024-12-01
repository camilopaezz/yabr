import { ElectronAPI } from '@electron-toolkit/preload'

export interface IElectronAPI {
  selectImage: () => Promise<string>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: IElectronAPI
  }
}
