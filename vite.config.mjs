import { defineConfig } from 'vite';
export default defineConfig({
  base:'./',
  build:{outDir:'build',emptyOutDir:true,assetsInlineLimit:0,chunkSizeWarningLimit:650},
  server:{host:'127.0.0.1',strictPort:true,port:8797},
});
