import useZustand from '@/context'
import { ReactElement } from 'react'

interface Props {
  className?: string
}

const DebugMenu = ({ className }: Props): ReactElement => {
  const { consoleLog } = useZustand()

  return (
    <section className={`my-6 ${className === undefined ? '' : className}`}>
      <div className='hacker overflow-x-hidden p-4 w-full h-40 bg-zinc-900 rounded-xl'>
        {consoleLog === '' ? 'No console logs yet...' : consoleLog}
      </div>
    </section>
  )
}

export default DebugMenu
