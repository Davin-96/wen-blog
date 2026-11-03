/* 通过 GitHub Contents API 推送文件（适配空仓库）
 * 用法: node admin/push-api.mjs <token> [repo]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

setGlobalDispatcher(new EnvHttpProxyAgent());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLOG_ROOT = path.resolve(__dirname, '..');
const TOKEN = process.argv[2];
const REPO = process.argv[3] || 'Davin-96/wen-blog';
const BASE = 'https://api.github.com/repos/' + REPO;

if (!TOKEN) { console.error('用法: node push-api.mjs <token> [repo]'); process.exit(1); }

async function api(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${method} ${url}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// 读取 .gitignore
const gitignorePath = path.join(BLOG_ROOT, '.gitignore');
const ignorePatterns = fs.existsSync(gitignorePath)
  ? fs.readFileSync(gitignorePath, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'))
  : [];

function isIgnored(relPath) {
  return ignorePatterns.some(pat => {
    const rx = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
    return rx.test(relPath) || rx.test(relPath + '/');
  });
}

function walk(dir, rel = '', files = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules' || name === 'dist' || name === '.astro') continue;
    const abs = path.join(dir, name);
    const relPath = rel ? rel + '/' + name : name;
    if (isIgnored(relPath)) continue;
    if (fs.statSync(abs).isDirectory()) walk(abs, relPath, files);
    else files.push({ rel: relPath, abs });
  }
  return files;
}

const files = walk(BLOG_ROOT);
console.log(`收集到 ${files.length} 个文件，开始推送...`);

let lastSha = null;

for (const f of files) {
  const content = fs.readFileSync(f.abs);
  const b64 = content.toString('base64');
  try {
    const result = await api('PUT', '/contents/' + f.rel, {
      message: lastSha ? '更新博客内容' : '初始化博客：Astro 静态站 + 工作台',
      content: b64,
      branch: 'main',
    });
    lastSha = result.commit?.sha || lastSha;
    console.log(`  ✓ ${f.rel}`);
  } catch (e) {
    console.error(`  ✗ ${f.rel}: ${e.message.slice(0, 100)}`);
  }
}

console.log('\n✅ 推送完成: https://github.com/' + REPO);
