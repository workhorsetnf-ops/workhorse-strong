import { defineConfig } from 'vitest/config'
// jsx: 'automatic' so .jsx screens can be mounted in tests without importing React
export default defineConfig({ esbuild: { jsx: 'automatic' }, test: { include: ['tests/**/*.test.{js,jsx}'], environment: 'node' } })
