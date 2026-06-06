import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function viewerManualChunk(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined

  if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/zustand/')) {
    return 'vendor-react'
  }
  if (
    id.includes('/remark-') ||
    id.includes('/rehype-') ||
    id.includes('/unified/') ||
    id.includes('/unist-util-visit/') ||
    id.includes('/gray-matter/') ||
    id.includes('/katex/')
  ) {
    return 'vendor-markdown'
  }
  if (id.includes('/highlight.js/')) {
    return 'vendor-highlight'
  }
  if (id.includes('/mermaid/') || id.includes('/cytoscape/') || id.includes('/dagre/')) {
    return 'vendor-mermaid'
  }
  if (id.includes('/jsxgraph/')) {
    return 'vendor-jsxgraph'
  }
  if (id.includes('/function-plot/')) {
    return 'vendor-function-plot'
  }
  if (id.includes('/d3')) {
    return 'vendor-d3'
  }
  return undefined
}

// The Laravel share page references exactly two stable filenames —
// share-viewer.js and share-viewer.css (cache-busted by ?v=). Lazy
// chunks keep content hashes and load relative to the entry module.
export default defineConfig({
  root: __dirname,
  base: './',
  resolve: {
    alias: [
      { find: '@renderer', replacement: resolve(__dirname, '../../packages/app-core/src') },
      { find: '@shared', replacement: resolve(__dirname, '../../packages/shared-domain/src') },
      {
        find: '@bridge-contract',
        replacement: resolve(__dirname, '../../packages/bridge-contract/src')
      }
    ]
  },
  server: {
    port: 5179
  },
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 3500,
    sourcemap: false,
    // One stylesheet for the whole viewer (lazy chunks included) so the
    // Blade page only ever links share-viewer.css.
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        manualChunks: viewerManualChunk,
        entryFileNames: 'share-viewer.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (info) =>
          info.name?.endsWith('.css') ? 'share-viewer.css' : 'assets/[name]-[hash][extname]'
      }
    }
  }
})
