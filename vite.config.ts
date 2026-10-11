import { defineConfig } from 'vite';

export default defineConfig({
  build: { chunkSizeWarningLimit: 800 },
  // Tests avec des amis via un tunnel Cloudflare temporaire (cloudflared → *.trycloudflare.com).
  preview: { allowedHosts: ['.trycloudflare.com'] },
  server: { allowedHosts: ['.trycloudflare.com'] },
});
