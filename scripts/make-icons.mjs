// App icon: a magnifier over a chair, walnut on cream. Generates every size from SVG.
//   npm run icons
import { mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const WALNUT = '#8A5A2B'
const WALNUT_DARK = '#5E3B1A'

function chair(color) {
  // front-facing dining chair: framed backrest with two slats, seat, four-legged base
  return `
    <g fill="${color}">
      <path d="M392 318a40 40 0 0 1 40-40h102a40 40 0 0 1 40 40v176h-42V322h-98v172h-42z"/>
      <rect x="447" y="318" width="26" height="176" rx="13"/>
      <rect x="493" y="318" width="26" height="176" rx="13"/>
      <rect x="366" y="486" width="234" height="58" rx="22"/>
      <rect x="382" y="530" width="40" height="150" rx="20"/>
      <rect x="544" y="530" width="40" height="150" rx="20"/>
      <rect x="402" y="586" width="162" height="22" rx="11" opacity="0.7"/>
    </g>`
}

function appSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FBF6EE"/>
      <stop offset="1" stop-color="#EEE2CF"/>
    </linearGradient>
    <linearGradient id="lens" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFDF9"/>
      <stop offset="1" stop-color="#F4EADB"/>
    </linearGradient>
  </defs>
  <rect x="32" y="32" width="960" height="960" rx="220" fill="url(#bg)"/>
  <rect x="32" y="32" width="960" height="960" rx="220" fill="none" stroke="#000" stroke-opacity="0.06" stroke-width="4"/>
  <line x1="668" y1="668" x2="842" y2="842" stroke="${WALNUT_DARK}" stroke-width="112" stroke-linecap="round"/>
  <circle cx="482" cy="478" r="262" fill="url(#lens)"/>
  ${chair(WALNUT)}
  <circle cx="482" cy="478" r="262" fill="none" stroke="${WALNUT}" stroke-width="64"/>
  <path d="M330 330 A215 215 0 0 1 482 262" fill="none" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="22" stroke-linecap="round"/>
</svg>`
}

function traySvg(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <line x1="680" y1="680" x2="880" y2="880" stroke="${color}" stroke-width="150" stroke-linecap="round"/>
  <circle cx="470" cy="470" r="300" fill="none" stroke="${color}" stroke-width="110"/>
  <g fill="${color}">
    <path d="M370 300a50 50 0 0 1 50-50h100a50 50 0 0 1 50 50v190h-70V320h-60v170h-70z"/>
    <rect x="340" y="470" width="260" height="80" rx="30"/>
    <rect x="356" y="520" width="64" height="170" rx="32"/>
    <rect x="520" y="520" width="64" height="170" rx="32"/>
  </g>
</svg>`
}

const png = (svg, size) => sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toBuffer()

mkdirSync('build', { recursive: true })
mkdirSync('resources', { recursive: true })
writeFileSync('build/icon.svg', appSvg())
writeFileSync('build/icon.png', await png(appSvg(), 1024))
writeFileSync('resources/icon.png', await png(appSvg(), 512))
const icoSizes = [16, 24, 32, 48, 64, 128, 256]
writeFileSync('build/icon.ico', await pngToIco(await Promise.all(icoSizes.map((s) => png(appSvg(), s)))))
writeFileSync('resources/tray.png', await png(traySvg(WALNUT), 32))
writeFileSync('resources/tray@2x.png', await png(traySvg(WALNUT), 64))
writeFileSync('resources/trayTemplate.png', await png(traySvg('#000000'), 16))
writeFileSync('resources/trayTemplate@2x.png', await png(traySvg('#000000'), 32))
console.log('icons written')
