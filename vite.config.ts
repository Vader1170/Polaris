import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

build: {
  rollupOptions: {
    input: {
      main: path.resolve(__dirname, 'index.html'),
      mission: path.resolve(__dirname, 'mission.html'),
      principles: path.resolve(__dirname, 'principles.html'),
      howitworks: path.resolve(__dirname, 'how-it-works.html'),
      navigator: path.resolve(__dirname, 'navigator.html'),
      story: path.resolve(__dirname, 'story.html'),
      signin: path.resolve(__dirname, 'signin.html'),
      about: path.resolve(__dirname, 'about.html'),
    },
  },
},
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

