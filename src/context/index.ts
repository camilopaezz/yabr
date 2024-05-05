import { create } from 'zustand'

interface Store {
  consoleLog: string
  inputPath: string
  isBatch: boolean
  isProcessing: boolean
  outputPath: string
  resultPath: string
  setConsoleLog: (consoleLog: string) => void
  setInputPath: (inputPath: string) => void
  setIsBatch: (isBatch: boolean) => void
  setIsProcessing: (isProcessing: boolean) => void
  setOutputPath: (outputPath: string) => void
  setResultPath: (resultPath: string) => void
}

const useZustand = create<Store>((set) => (
  {
    consoleLog: '',
    inputPath: '',
    isBatch: false,
    isProcessing: false,
    outputPath: '',
    resultPath: '',
    setConsoleLog: (consoleLog: string) => set({ consoleLog }),
    setInputPath: (inputPath: string) => set({ inputPath }),
    setIsBatch: (isBatch: boolean) => set({ isBatch }),
    setIsProcessing: (isProcessing: boolean) => set({ isProcessing }),
    setOutputPath: (outputPath: string) => set({ outputPath }),
    setResultPath: (resultPath: string) => set({ resultPath })
  }
))

export default useZustand
