import { removeBackground } from '@imgly/background-removal-node'
import path from 'path'
import fs from 'fs/promises'
import { dialog } from 'electron'

export const handleRemoveBackground = async (
  _: Electron.IpcMainInvokeEvent,
  file: string
): Promise<string> => {
  if (!file) {
    throw new Error('No file in state')
  }

  const result = await removeBackground(`file://${file}`)

  // Make it from a blob to an ArrayBuffer and then Buffer
  const ABResult = await result.arrayBuffer()
  const buffer = Buffer.from(ABResult)

  const fileName = path.parse(file).name
  const newFilePath = path.join(path.parse(file).dir, `${fileName}-no-bg.png`)

  try {
    await fs.writeFile(newFilePath, buffer)
    console.log('File saved:', newFilePath)
  } catch (error) {
    console.error(error)
  }

  return newFilePath
}

export const handleSelectImage = async (): Promise<string | undefined> => {
  const { filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'webp'] }]
  })

  return filePaths[0]
}
