import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // `host: true` binds 0.0.0.0 instead of the loopback, which is what makes
  // Vite print the `Network:` URL as well as `Local:`. Without it the dev
  // server is only reachable from this machine and the banner just says
  // "use --host to expose".
  //
  // It does mean anything on the same Wi-Fi can load the dev server. That is
  // the point - it is how you open the app on a phone - but it is worth
  // knowing on a network you do not trust.
  server: { host: true },

  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
