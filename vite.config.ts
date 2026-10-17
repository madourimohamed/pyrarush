import { defineConfig } from 'vite';
import { themeEditor } from './editor/vitePlugin';

export default defineConfig({
  // Éditeur de décor (editeur.html) : lecture et écriture des thèmes, en développement seulement.
  plugins: [themeEditor()],
  build: { chunkSizeWarningLimit: 800 },
  // Tests avec des amis via un tunnel Cloudflare temporaire (cloudflared → *.trycloudflare.com).
  preview: { allowedHosts: ['.trycloudflare.com'] },
  // En développement, comptes et multijoueur passent par le serveur du jeu (npm run build:server && npm run server).
  server: {
    allowedHosts: ['.trycloudflare.com'],
    proxy: { '/ws': { target: 'ws://localhost:8787', ws: true }, '/api': 'http://localhost:8787' },
  },
});
