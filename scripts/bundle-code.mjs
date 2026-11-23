import fs from 'node:fs';
import path from 'node:path';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.github',
  'dist',
  'build',
  '.vite',
  '.vscode',
]);
const IGNORED_FILES = new Set(['package-lock.json', 'code.txt', 'bundle-code.mjs']);
const ALLOWED_EXTS = new Set(['.html', '.css', '.js', '.mjs', '.json', '.md']);

function collectFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name) || IGNORED_FILES.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (ALLOWED_EXTS.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = collectFiles('.').sort();

const bundle = files
  .map((file) => {
    const normalized = file.replaceAll('\\', '/');
    const raw = fs.readFileSync(file, 'utf8');
    const content = raw.endsWith('\n') ? raw : `${raw}\n`;
    return `==> ${normalized} <==\n${content}`;
  })
  .join('\n');

fs.writeFileSync('code.txt', bundle, 'utf8');

const sizeKB = (fs.statSync('code.txt').size / 1024).toFixed(1);
console.log(`Bundled ${files.length} files into code.txt (${sizeKB} KB)`);
