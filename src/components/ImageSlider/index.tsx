import useZustand from '@/context'
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider'

const ImageSlider = (): React.ReactElement => {
  const { inputPath, resultPath } = useZustand()

  if (inputPath === '') {
    return (
      <section className='grid place-items-center col-span-6 xl:col-span-7'>
        <p className='text-2xl'>Select an image to start</p>
      </section>
    )
  }

  if (resultPath === '') {
    return (
      <section className='grid place-items-center col-span-6 xl:col-span-7'>
        <img className='max-h-screen' src={`atom:\\${inputPath}`} alt='' />
      </section>
    )
  }

  return (
    <section className='grid place-items-center col-span-6 xl:col-span-7'>
      <ReactCompareSlider
        className='w-full max-h-screen'
        itemOne={
          <ReactCompareSliderImage
            style={{
              objectFit: 'contain',
              width: '100%',
              maxHeight: '100vh'
            }} src={`atom:\\${inputPath}`}
          />
          }
        itemTwo={
          <ReactCompareSliderImage
            style={{
              objectFit: 'contain',
              maxHeight: '100vh',
              backgroundColor: 'white',
              backgroundImage: `
              linear-gradient(45deg, #ccc 25%, transparent 25%),
              linear-gradient(-45deg, #ccc 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #ccc 75%),
              linear-gradient(-45deg, transparent 75%, #ccc 75%)`,
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
            }} src={`atom:\\${resultPath}`}
          />
          }
      />
    </section>
  )
}

export default ImageSlider
