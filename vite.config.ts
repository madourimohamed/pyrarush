import { defineConfig } from 'vite';

export default defineConfig({
  build: { chunkSizeWarningLimit: 800 },
  // Tests avec des amis via un tunnel Cloudflare temporaire (cloudflared → *.trycloudflare.com).
  preview: { allowedHosts: ['.trycloudflare.com'] },
  // En développement, comptes et multijoueur passent par le serveur du jeu (npm run build:server && npm run server).
  server: {
    allowedHosts: ['.trycloudflare.com'],
    proxy: { '/ws': { target: 'ws://localhost:8787', ws: true }, '/api': 'http://localhost:8787' },
  },
});
