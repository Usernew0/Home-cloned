import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { publicBuildEnv } from './config/publicEnv';

export default defineConfig(({ mode }) => {
  const publicEnv = publicBuildEnv(loadEnv(mode, process.cwd(), ''));
  return {
    plugins: [react(), tailwindcss()],
    // Expose only reviewed public values, never the entire hosting environment.
    envPrefix: [],
    define: Object.fromEntries(Object.entries(publicEnv).map(([key, value]) => [
      `import.meta.env.${key}`, JSON.stringify(value),
    ])),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'motion/react',
        'lucide-react',
        'canvas-confetti',
      ],
    },
    build: {
      target: 'es2020',
      modulePreload: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('firebase')) return 'vendor-firebase';
              if (id.includes('@supabase')) return 'vendor-supabase';
              if (id.includes('jspdf') || id.includes('jszip') || id.includes('html2canvas') || id.includes('canvas-confetti') || id.includes('qrcode') || id.includes('browser-image-compression')) {
                return 'vendor-utils';
              }
              if (id.includes('lucide-react')) return 'vendor-icons';
              if (id.includes('motion')) return 'vendor-motion';
              if (id.includes('react') || id.includes('react-dom')) return 'vendor-react';
              return 'vendor-core';
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
