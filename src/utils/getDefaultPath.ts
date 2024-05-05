const getDefaultPath = (inputPath: string): string => {
  const path = inputPath.split('/')
  const isWindows = path.length === 1

  console.log('Path', {
    inputPath,
    path,
    isWindows
  })

  if (isWindows) {
    return inputPath.split('\\').slice(0, -1).join('\\')
  }

  return path.slice(0, -1).join('/')
}

export default getDefaultPath
