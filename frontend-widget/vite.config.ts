import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Prevent "process is not defined" in browser
    'process.env': {},
    'process.env.NODE_ENV': '"production"',
  },
  build: {
    lib: {
      entry: 'src/embed.ts',
      name: 'BunnyHoneyWidget',
      fileName: () => 'embed.js',
      formats: ['iife'],
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {},
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') return 'widget.css';
          return assetInfo.name || 'asset';
        },
      },
    },
  },
});
