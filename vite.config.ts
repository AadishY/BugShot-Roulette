import { defineConfig, PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'node:fs';

// Resolve Windows junction / symlink paths to canonical path so esbuild and Vite's optimizeDeps cwd match
try {
  const currentCwd = process.cwd();
  if (fs.existsSync(currentCwd)) {
    const canonicalCwd = fs.realpathSync(currentCwd);
    if (canonicalCwd && canonicalCwd.toLowerCase() !== currentCwd.toLowerCase()) {
      process.chdir(canonicalCwd);
    }
  }
} catch {
  // Ignore fallback
}

const plugins: PluginOption[] = [react()];
if (process.env.HTTPS === 'true') {
  plugins.push(basicSsl());
}

export default defineConfig({
  plugins,
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'lucide-react',
      'socket.io-client',
      'three',
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      'firebase/analytics'
    ],
    exclude: [
      '@discord/embedded-app-sdk',
      'three/examples/jsm/loaders/DRACOLoader.js',
      'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js'
    ]
  },
  server: {
    host: true,
    port: 5173,
    hmr: {
      clientPort: 5173
    }
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          react: ['react', 'react-dom'],
          ui: ['lucide-react'],
          socket: ['socket.io-client']
        }
      }
    },
    chunkSizeWarningLimit: 1000
  }
});