import { fileURLToPath } from 'node:url';
import { readPdfEditions, generateDevPdf } from './pdf-editions.js';
import { editionFingerprint } from '../../src/lib/editionFingerprint.js';

/** Only installed in Astro's development server; production serves static build PDFs. */
export default function devPdf() {
  let root;
  const pending = new Map();
  return {
    name: 'tidy-traces-dev-pdf',
    hooks: {
      'astro:config:done': ({ config }) => { root = fileURLToPath(config.root); },
      'astro:server:setup': ({ server, logger }) => {
        server.middlewares.use(async (req, res, next) => {
          const pathname = new URL(req.url, 'http://localhost').pathname;
          const match = pathname.match(/^\/pdf\/(\d{4}-\d{2}-\d{2}|latest)\.pdf$/);
          if (!match && pathname !== '/latest.pdf') return next();
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, { Allow: 'GET, HEAD' }).end();
            return;
          }
          try {
            const editions = await readPdfEditions(root);
            const requested = match?.[1] || 'latest';
            const edition = requested === 'latest' ? editions.at(-1) : editions.find((item) => item.date === requested);
            if (!edition) {
              res.writeHead(404, { 'Content-Type': 'text/plain' }).end('No AI observability issue exists for this date.');
              return;
            }
            const headers = {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="tidy-traces-${edition.date}.pdf"`,
              'Cache-Control': 'no-store',
            };
            if (req.method === 'HEAD') { res.writeHead(200, headers).end(); return; }
            // Use the bound local socket, never an untrusted Host header, for the render URL.
            const host = req.socket.localAddress.includes(':') ? `[${req.socket.localAddress}]` : req.socket.localAddress;
            const origin = `${server.config.server.https ? 'https' : 'http'}://${host}:${req.socket.localPort}`;
            // Share simultaneous clicks, but render again after edits instead of serving stale PDFs.
            const key = editionFingerprint(edition);
            let job = pending.get(key);
            if (!job) {
              job = generateDevPdf(edition, origin).finally(() => { pending.delete(key); });
              pending.set(key, job);
            }
            const buffer = await job;
            res.writeHead(200, { ...headers, 'Content-Length': buffer.length });
            res.end(buffer);
          } catch (error) {
            logger.error(`PDF download failed: ${error.message}`);
            res.writeHead(503, { 'Content-Type': 'text/plain' }).end('PDF generation failed. Check the dev server logs and try again.');
          }
        });
      },
    },
  };
}
