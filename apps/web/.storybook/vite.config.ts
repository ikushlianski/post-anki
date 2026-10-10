import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: [
      {
        find: /^\.\/knowledge-bit-review\.api$/,
        replacement: fileURLToPath(
          new URL('./stubs/knowledge-bit-review.api.stub.ts', import.meta.url),
        ),
      },
    ],
  },
  plugins: [tailwindcss(), viteReact()],
})
