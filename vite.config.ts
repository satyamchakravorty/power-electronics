import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Relative base so the built bundle works from a GitHub Pages subpath.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
