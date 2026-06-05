import { defineConfig, loadEnv } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const SERVER_ENV_KEYS = ['API_BASE_URL', 'API_SHARED_SECRET']

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '')

  for (const key of SERVER_ENV_KEYS) {
    if (fileEnv[key] && !process.env[key]) {
      process.env[key] = fileEnv[key]
    }
  }

  return {
    resolve: { tsconfigPaths: true },
    ssr: { noExternal: ['@post-anki/api'] },
    plugins: [devtools(), tailwindcss(), tanstackStart(), nitro(), viteReact()],
  }
})
