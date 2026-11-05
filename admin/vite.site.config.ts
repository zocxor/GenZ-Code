import {defineConfig} from 'vite';
// Public pages at the hosting root: landing, privacy policy and account deletion.
export default defineConfig({
  root: 'site',
  base: '/',
  build: {outDir: '../dist', emptyOutDir: false, sourcemap: false, target: 'es2022', rollupOptions: {input: {index: 'site/index.html', privacy: 'site/privacy.html', deleteAccount: 'site/delete-account.html'}}},
});
