#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { generatePdfs, parsePdfArgs } from './lib/pdf-editions.js';

try {
  // Keep the module importable for verification without launching Chrome.
  if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const options = parsePdfArgs(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: npm run generate-pdf -- [--day YYYY-MM-DD | --all] [--no-upload]\nBuild the site first. Defaults to the latest AI observability issue. Files stay in dist/; no CDN credentials or upload required.');
    } else {
      await generatePdfs(options);
    }
  }
} catch (error) {
  console.error(`PDF generation failed: ${error.message}`);
  process.exitCode = 1;
}
