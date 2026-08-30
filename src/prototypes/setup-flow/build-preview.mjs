/**
 * PROTOTYPE — ticket 18. THROWAWAY.
 *
 * Generates `preview.html` from `preview.template.html` by inlining the two
 * `blobatar@2.7.0` bundles that are already in node_modules.
 *
 * Why inline rather than hand-roll a fake: the whole point of this prototype is
 * to check ticket 11's claims against the *real* library — that reroll moves
 * shape and never colour, and that the six tone swatches are addressable. A
 * dependency-free twin that draws its own blobs would prove nothing. Both dist
 * files are self-contained bundles with no imports, so this is a paste.
 *
 *   node src/prototypes/setup-flow/build-preview.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '../../../node_modules/blobatar/dist')

/**
 * `export{a as foo, b as bar}` → `globalThis.NAME = { foo: a, bar: b }`, with
 * the whole bundle wrapped in an IIFE.
 *
 * The IIFE is not tidiness. Both bundles are minified to one-letter top-level
 * `var`s, and as two classic `<script>`s they would share one global scope:
 * loading `expression.js` after `index.js` silently reassigns `R`, `M`, `x`
 * and friends, and the first blobatar render dies with `R is not a function`.
 * Found by shipping it without the wrapper.
 */
const globalise = (source, name) => {
  const match = source.match(/export\{([^}]*)\};?/)
  if (!match) throw new Error(`no export statement found for ${name}`)
  const pairs = match[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [local, exported] = part.split(/\s+as\s+/)
      return `${JSON.stringify((exported ?? local).trim())}: ${local.trim()}`
    })
  const body = source
    .replace(match[0], `globalThis[${JSON.stringify(name)}] = {${pairs.join(',')}};`)
    .replace(/\/\/#\s*(debugId|sourceMappingURL)=.*$/gm, '')
  return `;(function(){\n${body}\n})();`
}

const html = readFileSync(join(here, 'preview.template.html'), 'utf8')
  .replace('/*INJECT_BLOBATAR*/', () => globalise(readFileSync(join(dist, 'index.js'), 'utf8'), 'BL'))
  .replace(
    '/*INJECT_EXPRESSION*/',
    () => globalise(readFileSync(join(dist, 'expression.js'), 'utf8'), 'BX'),
  )

writeFileSync(join(here, 'preview.html'), html)
console.log(`preview.html written — ${(html.length / 1024).toFixed(0)} KB, opens with no build step`)
