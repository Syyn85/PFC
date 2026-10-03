import { defineConfig } from 'vite';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Mode "single" : produit un unique fichier HTML autonome (JS, CSS et polices
 * inline). Pratique pour partager une démo jouable sans serveur.
 */
function inlineSingleFile() {
  return {
    name: 'pfc-inline-single-file',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const pages = Object.values(bundle).filter((f) => f.fileName.endsWith('.html'));
      for (const page of pages) {
        let html = String(page.source);
        for (const [fileName, file] of Object.entries(bundle)) {
          if (file.type === 'chunk') {
            const re = new RegExp(`<script[^>]*src="[^"]*${escapeRe(fileName)}"[^>]*></script>`);
            if (!re.test(html)) continue;
            const code = file.code.replace(/<\/script/gi, '<\\/script');
            html = html.replace(re, () => `<script type="module">${code}</script>`);
            delete bundle[fileName];
          } else if (fileName.endsWith('.css')) {
            const re = new RegExp(`<link[^>]*href="[^"]*${escapeRe(fileName)}"[^>]*>`);
            if (!re.test(html)) continue;
            html = html.replace(re, () => `<style>${file.source}</style>`);
            delete bundle[fileName];
          }
        }
        page.source = html;
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: single ? [inlineSingleFile()] : [],
    build: {
      outDir: single ? 'dist-single' : 'dist',
      assetsInlineLimit: single ? Number.MAX_SAFE_INTEGER : 4096,
      cssCodeSplit: !single,
      chunkSizeWarningLimit: 1200,
    },
    server: { host: true },
  };
});
