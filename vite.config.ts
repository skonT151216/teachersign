import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const isSingleFile = process.env.SINGLE_FILE === 'true';
  const isCloudflare = process.env.CF_PAGES === '1';

  return {
    base: isSingleFile ? './' : '/',
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      isSingleFile && viteSingleFile()
    ].filter(Boolean),
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      assetsInlineLimit: 100000000, // Huge limit to inline everything
      chunkSizeWarningLimit: 100000000,
      cssCodeSplit: false,
      emptyOutDir: false, // Disable to avoid EPERM on network drives
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    }
  };
});
