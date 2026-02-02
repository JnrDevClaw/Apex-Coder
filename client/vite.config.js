import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		port: 5173,
		host: true,
		hmr: {
			overlay: true,
			protocol: 'ws',
			host: 'localhost'
		},
		watch: {
			usePolling: true,
			interval: 1000,
			ignored: ['**/node_modules/**', '**/.git/**']
		},
		fs: {
			strict: false
		}
	},
	preview: {
		port: 4173,
		host: true
	},
	optimizeDeps: {
		exclude: ['svelte']
	},
	clearScreen: false
});