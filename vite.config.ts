import { defineConfig } from 'vite'

export default defineConfig({
  css: {
    postcss: './postcss.config.js',
  },
  define: {
    'process.env': {}
  },
  optimizeDeps: {
    include: ['better-sqlite3']
  },
  build: {
    commonjsOptions: {
      include: [/better-sqlite3/, /node_modules/]
    }
  }
})