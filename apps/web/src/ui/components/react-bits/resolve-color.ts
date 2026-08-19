const WHITE: [number, number, number] = [1, 1, 1]

/** Turn any CSS color into sRGB channels in the 0-1 range that WebGL uniforms accept. */
export function resolveColorChannels(color: string): [number, number, number] {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (context === null) return WHITE

  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [red = 255, green = 255, blue = 255] = context.getImageData(0, 0, 1, 1).data
  return [red / 255, green / 255, blue / 255]
}
