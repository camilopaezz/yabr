/// <reference types="vite/client" />
interface Window {
  // expose in the `electron/preload/index.ts`
  ipcRenderer: import('electron').IpcRenderer
  API: {
    selectInput: (isBatch: boolean) => Promise<string>
    selectOutput: () => Promise<string>
    removeBackground: (inputPath: string, outputPath: string, isBatch: boolean) => Promise<{
      resultPath: string
      consoleLog: string
    }>
  }
}
