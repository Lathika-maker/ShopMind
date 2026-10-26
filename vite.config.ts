import 'dotenv/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, Plugin } from 'vite';
import { handleApiRequest } from './src/server/apiMiddleware.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function shopmindApiPlugin(): Plugin {
  return {
    name: 'shopmind-api-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        handleApiRequest(req, res, next);
      });
    },
  };
}

process.env.VITE_CONFIG_NATIVE_IGNORE_WARNING = 'true';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), shopmindApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio iframe environment to avoid reconnection polling
      hmr: false,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
