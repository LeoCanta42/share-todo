/**
 * iOS launch screens ("apple-touch-startup-image").
 *
 * iOS paints a blank white page while an installed web app boots — the only way
 * to replace it with the brand is to declare an image per device size, as a
 * `<link>` with a media query matching that exact screen. That is what this list
 * is: the images in `public/splash/` plus the query that selects each of them.
 *
 * The images were generated from `public/icons/icon-192.png`: the manifest's
 * background colour (#f8fafc light / #020617 dark) with the mark centred at 28% of
 * the shorter side. Change the brand colour or the mark and they have to be
 * regenerated — the sizes below are the source of truth for the file names.
 *
 * Only the device sizes in use are listed. iOS 12 and older never match the dark
 * variants (they do not know `prefers-color-scheme`), and simply fall back to the
 * light image — which is why the light links carry no scheme constraint and the
 * dark ones come after them.
 */
export interface AppleSplashSize {
  /** CSS points, as iOS reports them in the media query. */
  width: number
  height: number
  scaleFactor: number
}

export interface AppleSplashLink {
  rel: 'apple-touch-startup-image'
  href: string
  media: string
}

export const APPLE_SPLASH_SIZES: AppleSplashSize[] = [
  { width: 430, height: 932, scaleFactor: 3 }, // iPhone 15/16 Pro Max
  { width: 393, height: 852, scaleFactor: 3 }, // iPhone 15/16 Pro
  { width: 390, height: 844, scaleFactor: 3 }, // iPhone 13/14
  { width: 375, height: 667, scaleFactor: 2 }, // iPhone SE
  { width: 834, height: 1194, scaleFactor: 2 }, // iPad Pro 11"
  { width: 1024, height: 1366, scaleFactor: 2 } // iPad Pro 12.9"
]

function deviceQuery(size: AppleSplashSize, orientation: 'portrait' | 'landscape'): string {
  const width = orientation === 'portrait' ? size.width : size.height
  const height = orientation === 'portrait' ? size.height : size.width
  return `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${size.scaleFactor}) and (orientation: ${orientation})`
}

function splashLinks(): AppleSplashLink[] {
  const links: AppleSplashLink[] = []

  for (const size of APPLE_SPLASH_SIZES) {
    for (const orientation of ['portrait', 'landscape'] as const) {
      const width = (orientation === 'portrait' ? size.width : size.height) * size.scaleFactor
      const height = (orientation === 'portrait' ? size.height : size.width) * size.scaleFactor
      const query = deviceQuery(size, orientation)

      links.push({
        rel: 'apple-touch-startup-image',
        href: `/splash/${width}x${height}-light.png`,
        media: query
      })
      links.push({
        rel: 'apple-touch-startup-image',
        href: `/splash/${width}x${height}-dark.png`,
        media: `${query} and (prefers-color-scheme: dark)`
      })
    }
  }

  return links
}

export const appleSplashLinks: AppleSplashLink[] = splashLinks()
