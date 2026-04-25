import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      // Mirror tsconfig.json: "@/*" → "./*" relative to FitDesk/
      '@': path.resolve(__dirname, './'),
    },
  },
})
