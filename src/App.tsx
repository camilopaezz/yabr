import DebugMenu from './components/DebugMenu'
import Header from './components/Header'
import Options from './components/Options'
import SideBar from './components/Sidebar'
import Steps from './components/Steps'
import UpdateElectron from './components/update'

import './App.css'
import ImageSlider from './components/ImageSlider'

function App (): React.ReactElement {
  return (
    <div className='App grid grid-cols-9'>
      <SideBar>
        <Header />
        <section>
          <Options />
          <Steps />
        </section>
        <DebugMenu />
        <UpdateElectron />
      </SideBar>
      <ImageSlider />
    </div>
  )
}

export default App
