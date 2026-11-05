import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
// Served at /admin/ on Firebase Hosting; strict CSP headers are set in firebase.json.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  build: {outDir: 'dist/admin', emptyOutDir: true, sourcemap: false, target: 'es2022'},
  server: {fs: {allow: ['..']}},
});
