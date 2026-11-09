import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/<global-postcard>/',
  root: './',
  plugins: [
    tailwindcss()
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true
  }
});
