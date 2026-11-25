import { defineConfig, PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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

function collectDistAssets(dirPath: string, distRoot: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dirPath)) return acc;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectDistAssets(fullPath, distRoot, acc);
    } else if (entry.isFile() && /\.(js|css|wasm|webp|png|svg|ico|woff2?)$/i.test(entry.name)) {
      const rel = '/' + path.relative(distRoot, fullPath).replace(/\\/g, '/');
      acc.push(rel);
    }
  }
  return acc;
}

const swBuildManifestPlugin = (): PluginOption => {
  let resolvedOutDir = path.resolve(process.cwd(), 'dist');
  let resolvedAssetsDir = 'assets';

  return {
    name: 'sw-build-manifest',
    apply: 'build',
    configResolved(config) {
      resolvedOutDir = path.resolve(config.root, config.build.outDir);
      resolvedAssetsDir = config.build.assetsDir || 'assets';
    },
    closeBundle() {
      try {
        const distRoot = resolvedOutDir;
        const swPath = path.join(distRoot, 'sw.js');
        if (!fs.existsSync(swPath)) return;

        const buildStamp = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
        const builtAssets = collectDistAssets(path.join(distRoot, resolvedAssetsDir), distRoot).sort();

        let swCode = fs.readFileSync(swPath, 'utf8');
        swCode = swCode.replace(
          /const CACHE_NAME = ['"][^'"]+['"];/,
          `const CACHE_NAME = 'bugshot-roulette-${buildStamp}';`
        );
        swCode = swCode.replace(
          /const RUNTIME_CACHE = ['"][^'"]+['"];/,
          `const RUNTIME_CACHE = 'bugshot-roulette-runtime-${buildStamp}';`
        );

        const assetLines = builtAssets.length > 0
          ? builtAssets.map((a) => `    '${a}',`).join('\n')
          : '';
        swCode = swCode.replace(
          '// __VITE_BUILT_ASSETS_PLACEHOLDER__',
          () => assetLines
        );

        fs.writeFileSync(swPath, swCode, 'utf8');
      } catch (err) {
        console.warn('[sw-build-manifest] Failed stamping dist/sw.js:', err);
      }
    }
  };
};

const plugins: PluginOption[] = [react(), swBuildManifestPlugin()];
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
    port: 3000,
    hmr: false
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