import useZustand from '@/context'
import getDefaultPath from '@/utils/getDefaultPath'
import React from 'react'

const Steps = (): React.ReactElement => {
  const { isBatch, inputPath, outputPath, isProcessing, setConsoleLog, setInputPath, setOutputPath, setResultPath, setIsProcessing } = useZustand()

  const handleSelectImage = async (): Promise<void> => {
    const pathInput = await window.API.selectInput(isBatch)
    const isEmpty = pathInput === ''

    if (isEmpty) {
      return
    }

    const defaultPath = getDefaultPath(pathInput)

    setInputPath(pathInput)
    setResultPath('')
    setOutputPath(defaultPath)
  }

  const handleSelectOutput = async (): Promise<void> => {
    const pathOutput = await window.API.selectOutput()

    const isEmpty = pathOutput === ''

    setOutputPath(isEmpty ? outputPath : pathOutput)
    console.log('Select Output', pathOutput)
  }

  const handleRemoveBackground = async (): Promise<void> => {
    setIsProcessing(true)
    const result = await window.API.removeBackground(inputPath, outputPath, isBatch)

    setResultPath(result.resultPath)

    setIsProcessing(false)

    if (result.consoleLog !== '') {
      setConsoleLog(result.consoleLog)
    }

    console.log('Remove Background')
  }

  return (
    <article>
      <h2 className='my-2'>Steps:</h2>
      <ol className='pl-4 mt-0 list-none'>
        <li className='my-4'>
          <h3 className='my-2'>Step 1</h3>
          <button disabled={isProcessing} onClick={handleSelectImage} className='bg-orange-600'>
            {isBatch ? 'Select Images Directory' : 'Select Image'}
          </button>
          <p className='m-1 truncate w-52'>
            {inputPath === '' ? 'path/to/input' : inputPath}
          </p>
        </li>
        <li className='my-4'>
          <h3 className='my-2'>Step 2</h3>
          <button disabled={isProcessing} onClick={handleSelectOutput} className='bg-orange-600'>
            Select Directory
          </button>
          <p className='m-0 truncate w-52'>
            {outputPath === '' ? 'path/to/output' : outputPath}
          </p>
        </li>
        <li className='my-4'>
          <h3 className='my-2'>Step 3</h3>
          <button disabled={isProcessing} onClick={handleRemoveBackground} className='bg-orange-600'>
            Remove Background
          </button>
        </li>
      </ol>
    </article>
  )
}

export default Steps
