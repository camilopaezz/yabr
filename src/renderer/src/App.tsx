import { FC, useState } from 'react'

function App(): JSX.Element {
  const [file, setFile] = useState<undefined | string>()
  const [loading, setLoading] = useState(false)

  const handleSelectImage = async (): Promise<void> => {
    const result = await window.electron.ipcRenderer.invoke('select-image')
    if (result) {
      setFile(result)
    }
  }

  const handleRemoveBackground = async (): Promise<void> => {
    if (!file) return

    setLoading(true)
    const result = await window.electron.ipcRenderer.invoke('remove-background', file)

    if (result) {
      setFile(result)
    }
    setLoading(false)
  }

  return (
    <div className="app">
      <div className="sidebar">
        <div className="text">
          Build an Electron app with <span className="react">React</span>
          &nbsp;and <span className="ts">TypeScript</span>
        </div>
        <p>{file}</p>

        <button onClick={handleSelectImage}>select image</button>
        <button onClick={handleRemoveBackground}>remove background</button>
      </div>

      <div className="image">
        <ImageView filePath={file} loading={loading} />
      </div>
    </div>
  )
}

interface ImageViewProps {
  filePath: string | undefined
  loading: boolean
}

const ImageView: FC<ImageViewProps> = ({ filePath, loading }) => {
  if (loading) {
    return <span className="loader"></span>
  }

  if (filePath) {
    return <img src={`atom://${filePath}`} />
  }

  return <p>no file selected</p>
}

export default App
