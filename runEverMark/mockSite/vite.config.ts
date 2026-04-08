import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { generateSkillMarkdown } from 'web-skill/dev';
import { getPublishedWebSkills } from './src/webSkills/catalog';

function webSkillDocsPlugin() {
  const docs = getPublishedWebSkills().map((skill) => ({
    fileName: `skills/${skill.slug}/SKILL.md`,
    source: generateSkillMarkdown(skill),
  }));
  const docsByPath = new Map(
    docs.map((doc) => [`/${doc.fileName}`, doc.source]),
  );

  return {
    name: 'mock-site-web-skill-docs',
    configureServer(server: {
      middlewares: {
        use: (
          fn: (
            req: { url?: string },
            res: {
              setHeader: (name: string, value: string) => void;
              end: (body: string) => void;
            },
            next: () => void,
          ) => void,
        ) => void;
      };
    }) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0];
        if (!url) {
          next();
          return;
        }

        const source = docsByPath.get(url);
        if (!source) {
          next();
          return;
        }

        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.end(source);
      });
    },
    generateBundle() {
      for (const doc of docs) {
        this.emitFile({
          type: 'asset',
          fileName: doc.fileName,
          source: doc.source,
        });
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), webSkillDocsPlugin()],
  server: {
    port: 5176,
    strictPort: true
  }
});
