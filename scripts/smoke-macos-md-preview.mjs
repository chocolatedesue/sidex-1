#!/usr/bin/env node
/**
 * Smoke: macOS Markdown Preview must not hang on webview service worker.
 * Packaged Tauri on Mac uses WKWebView; with useHttpsScheme the origin is
 * https://tauri.localhost. Waiting forever for SW controllerchange blanks the
 * preview. Assert the host page skips SW on Safari and that public/ matches src.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'smoke-artifacts');
fs.mkdirSync(outDir, { recursive: true });

const evidence = { at: new Date().toISOString(), zone: 'Asia/Shanghai (UTC+8)', steps: [] };
const step = (name, ok, detail) => {
  evidence.steps.push({ name, ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);

const srcPre = read('src/vs/workbench/contrib/webview/browser/pre/index.html');
const pubPre = read('public/webview-pre/index.html');

step('webviewPre.publicMatchesSrc', srcPre === pubPre, `src=${sha(srcPre)} public=${sha(pubPre)}`);
step('webviewPre.skipSwOnSafari', srcPre.includes('disableServiceWorkerRuntime = disableServiceWorker || !serviceWorkerProtocolSupported || isSafari'));
step('webviewPre.safariComment', srcPre.includes('WKWebView') && srcPre.includes('Markdown Preview'));
step('webviewPre.swTimeoutFallback', srcPre.includes('service worker ready timed out'));
step('webviewPre.swFailureContinues', srcPre.includes('still render HTML') || srcPre.includes('continuing so preview content can render') || srcPre.includes('Webview service worker issue (continuing)'));
step('webviewPre.useHttpsSchemeMac', read('src-tauri/tauri.macos.conf.json').includes('"useHttpsScheme": true'));

const preview = read('src/vs/workbench/contrib/markdown/browser/markdownPreview.ts');
step('mdPreview.katexSameOrigin', preview.includes('katexStylesheetHref()') && !preview.includes('asWebviewUri(katexStylesheetUri())'));
step('mdPreview.localResourceRootsOrigin', preview.includes('URI.parse(window.location.origin)'));

const katex = read('src/vs/workbench/contrib/markdown/browser/markedKatexSupport.ts');
step('katex.prodOriginUrl', katex.includes('${origin}/katex/katex.min.css') || katex.includes('`/${origin}/katex') || katex.includes('/katex/katex.min.css'));

const postbuild = read('scripts/postbuild.js');
step('postbuild.syncWebviewPre', postbuild.includes('webview-pre') && postbuild.includes('WEBVIEW_PRE_SRC'));

const failed = evidence.steps.filter((s) => !s.ok).length;
evidence.failed = failed;
evidence.passed = evidence.steps.length - failed;
fs.writeFileSync(path.join(outDir, 'macos-md-preview-evidence.json'), JSON.stringify(evidence, null, 2));
console.log(`\n${evidence.passed}/${evidence.steps.length} passed`);
process.exit(failed ? 1 : 0);
