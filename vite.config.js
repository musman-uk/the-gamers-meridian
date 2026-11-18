import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/the-gamers-meridian/',
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
