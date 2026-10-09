import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(fixtureDirectory,'../..')
export default defineConfig({
  root:fixtureDirectory,
  resolve:{alias:{'@':repoRoot}},
  esbuild:{jsx:'automatic'},
  server:{host:'127.0.0.1',port:35793,strictPort:true,fs:{allow:[repoRoot]}},
  build:{outDir:path.join(fixtureDirectory,'dist-react19'),emptyOutDir:true},
})
