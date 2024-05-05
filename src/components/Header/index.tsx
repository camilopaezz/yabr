import { ReactElement } from 'react'

const Header = (): ReactElement => {
  return (
    <header className='text-center bg-gradient-to-r from-orange-700 to-yellow-400 bg-clip-text'>
      <div className='flex align-middle justify-center gap-4'>
        <img className='w-20' src='icon.png' alt='' />
        <div>
          <h1 className='m-0 text-transparent'>yarb</h1>
        </div>
      </div>
      <p>
        <b className='text-transparent'>Y</b>et
        <b className='text-transparent'> A</b>nother
        <b className='text-transparent'> B</b>ackground
        <b className='text-transparent'> R</b>emover
      </p>
    </header>
  )
}

export default Header
