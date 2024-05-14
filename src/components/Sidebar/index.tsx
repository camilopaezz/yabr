import { ReactElement } from 'react'

interface Props {
  children: React.ReactNode | React.ReactNode[]
}

const SideBar = ({ children }: Props): ReactElement => {
  return (
    <aside className="overflow-y-scroll py-6 px-3 h-screen min-w-80">
      {children}
    </aside>
  )
}

export default SideBar
