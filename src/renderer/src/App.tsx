import Versions from './components/Versions'
import electronLogo from './assets/electron.svg'
import { useState } from 'react'

function App(): JSX.Element {
  const [file, setFile] = useState<undefined | string>(undefined)

  return (
    <>
      <img alt="logo" className="logo" src={electronLogo} />
      <div className="creator">Powered by electron-vite</div>
      <div className="text">
        Build an Electron app with <span className="react">React</span>
        &nbsp;and <span className="ts">TypeScript</span>
      </div>
      <p>{file}</p>
      <button
        onClick={async () => {
          const result = await window.electron.ipcRenderer.invoke('select-image')
          if (result) {
            setFile(result)
          }
        }}
      >
        select image
      </button>

      <button
        onClick={async () => {
          const result = await window.electron.ipcRenderer.invoke('remove-background', file)
          if (result) {
            setFile(result)
          }
        }}
      >
        remove background
      </button>
      <Versions></Versions>
    </>
  )
}

export default App
