import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repositoryBase = '/CAS-BIS-v2/'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    target: 'es2021',
  },
  base: mode === 'github-pages' ? repositoryBase : '/',
}))
