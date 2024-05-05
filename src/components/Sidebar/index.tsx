import { ReactElement } from 'react'

interface Props {
  children: React.ReactNode | React.ReactNode[]

}

const SideBar = ({ children }: Props): ReactElement => {
  return (
    <aside className='overflow-y-scroll py-6 px-3 max-h-screen col-span-3 xl:col-span-2 grid border border-white'>
      {children}
    </aside>
  )
}

export default SideBar
