// Turns e2e screenshots (test-results/screens) into README images on a warm background.
//   npm run test:e2e && node scripts/make-screenshots.mjs
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'

const SRC = 'test-results/screens'
const OUT = 'docs/screenshots'
mkdirSync(OUT, { recursive: true })

async function framed(file, out, { trim = true, pad = 56, width = 1100 } = {}) {
  let img = sharp(`${SRC}/${file}`)
  if (trim) img = img.trim({ threshold: 1 })
  const buf = await img.png().toBuffer()
  const meta = await sharp(buf).metadata()
  const w = meta.width + pad * 2
  const h = meta.height + pad * 2
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EFE4D2"/><stop offset="1" stop-color="#D9C3A2"/></linearGradient></defs>
    <rect width="100%" height="100%" rx="28" fill="url(#g)"/></svg>`)
  const composed = await sharp(bg).composite([{ input: buf, left: pad, top: pad }]).png().toBuffer()
  await sharp(composed).resize({ width: Math.min(width, w) }).png().toFile(`${OUT}/${out}`)
}

await framed('05-search-he.png', 'search-hebrew.png')
await framed('06-search-ar.png', 'search-arabic.png')
await framed('14-rtl-ar-dark.png', 'dark-arabic.png')
await framed('08-scope-open.png', 'scope.png')
await framed('11-menu.png', 'menu.png')
await framed('10-copied.png', 'copied.png')
await framed('01-language.png', 'onboarding-language.png', { trim: false })
await framed('02-files.png', 'onboarding-files.png', { trim: false })
await framed('04-done.png', 'onboarding-done.png', { trim: false })
await framed('15-settings.png', 'settings.png', { trim: false })
console.log('screenshots written')
