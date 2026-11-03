/* 博客工作台后端 —— 零依赖 Node HTTP 服务
 * 运行: node admin/server.mjs  → http://localhost:8321
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLOG_ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(BLOG_ROOT, 'src', 'content', 'posts');
const THEME_FILE = path.join(BLOG_ROOT, 'public', 'theme.json');
const SETTINGS_FILE = path.join(__dirname, 'data.json');
const PORT = process.env.PORT || 8321;

if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR, { recursive: true });

/* ---------- 工具函数 ---------- */

function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: content };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      try { val = JSON.parse(val.replace(/'/g, '"')); }
      catch { val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean); }
    } else if (/^".*"$/.test(val) || /^'.*'$/.test(val)) {
      val = val.slice(1, -1);
    } else if (val === 'true') val = true;
    else if (val === 'false') val = false;
    else if (/^\d+(\.\d+)?$/.test(val)) val = Number(val);
    data[key] = val;
  }
  return { data, body: content.slice(m[0].length) };
}

function serializePost(data, body) {
  const lines = ['---'];
  lines.push('title: ' + JSON.stringify(data.title || ''));
  lines.push('date: ' + (data.date || ''));
  lines.push('tags: ' + JSON.stringify(data.tags || []));
  lines.push('summary: ' + JSON.stringify(data.summary || ''));
  if (data.cover) lines.push('cover: ' + JSON.stringify(data.cover));
  if (data.draft) lines.push('draft: true');
  lines.push('---');
  return lines.join('\n') + '\n' + body;
}

function readPosts() {
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
  return files.map(f => {
    const raw = fs.readFileSync(path.join(POSTS_DIR, f), 'utf8');
    const { data } = parseFrontmatter(raw);
    return {
      slug: f.replace(/\.md$/, ''),
      title: data.title || f,
      date: data.date ? String(data.date).slice(0, 10) : '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      summary: data.summary || '',
      draft: !!data.draft,
    };
  }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function readPost(slug) {
  const file = path.join(POSTS_DIR, slug + '.md');
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  const { data, body } = parseFrontmatter(raw);
  return { data, body };
}

function safeSlug(slug) {
  const s = String(slug || '').trim().replace(/\s+/g, '-').replace(/[^\w一-鿿-]/g, '');
  return s.slice(0, 100);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function git(args) {
  return execSync('git ' + args, { cwd: BLOG_ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 2e6) reject(new Error('body too large')); });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { reject(new Error('invalid json: ' + e.message)); }
    });
    req.on('error', reject);
  });
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

/* ---------- 路由 ---------- */

const routes = {
  'GET /api/posts': (req, res) => send(res, 200, { posts: readPosts() }),

  'GET /api/posts/:slug': (req, res, m) => {
    const p = readPost(m[0]);
    if (!p) return send(res, 404, { error: '文章不存在' });
    send(res, 200, p);
  },

  'POST /api/posts': async (req, res) => {
    const b = await readBody(req);
    const slug = safeSlug(b.slug);
    if (!slug) return send(res, 400, { error: '标题不能为空' });
    const data = {
      title: b.data?.title || slug,
      date: b.data?.date || new Date().toISOString().slice(0, 10),
      tags: Array.isArray(b.data?.tags) ? b.data.tags : [],
      summary: b.data?.summary || '',
      cover: b.data?.cover || '',
      draft: !!b.data?.draft,
    };
    fs.writeFileSync(path.join(POSTS_DIR, slug + '.md'), serializePost(data, b.body || ''), 'utf8');
    send(res, 200, { ok: true, slug });
  },

  'DELETE /api/posts/:slug': (req, res, m) => {
    const file = path.join(POSTS_DIR, m[0] + '.md');
    if (!fs.existsSync(file)) return send(res, 404, { error: '文章不存在' });
    fs.unlinkSync(file);
    send(res, 200, { ok: true });
  },

  'GET /api/theme': (req, res) => send(res, 200, readJson(THEME_FILE, {})),

  'POST /api/theme': async (req, res) => {
    const theme = await readBody(req);
    fs.writeFileSync(THEME_FILE, JSON.stringify(theme, null, 2), 'utf8');
    send(res, 200, { ok: true });
  },

  'GET /api/settings': (req, res) => send(res, 200, readJson(SETTINGS_FILE, { siteUrl: '' })),

  'POST /api/settings': async (req, res) => {
    const s = await readBody(req);
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2), 'utf8');
    send(res, 200, { ok: true });
  },

  'GET /api/git': (req, res) => {
    try {
      const branch = git('rev-parse --abbrev-ref HEAD').trim();
      const status = git('status --porcelain').trim();
      const remote = git('remote -v').trim();
      send(res, 200, { branch, status, hasRemote: remote.length > 0 });
    } catch (e) {
      send(res, 500, { error: 'git 不可用：' + String(e.message || e).split('\n')[0] });
    }
  },

  'POST /api/git/commit': async (req, res) => {
    try {
      const b = await readBody(req);
      git('add -A');
      git('commit -m ' + JSON.stringify((b.message || '更新博客').trim()));
      send(res, 200, { ok: true, output: '已提交' });
    } catch (e) {
      send(res, 500, { error: String(e.message || e).split('\n').slice(0, 3).join('\n') });
    }
  },

  'POST /api/git/push': (req, res) => {
    try {
      git('push');
      send(res, 200, { ok: true, output: '已推送，GitHub Actions 将自动部署' });
    } catch (e) {
      send(res, 500, { error: String(e.message || e).split('\n').slice(0, 3).join('\n') });
    }
  },
};

/* ---------- 启动 ---------- */

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;

  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'));
  }

  if (pathname.startsWith('/api/')) {
    for (const key of Object.keys(routes)) {
      const [method, ...pattern] = key.split(' ');
      const re = new RegExp('^' + pattern.join(' ').replace(/:([^/]+)/g, '([^/]+)') + '$');
      if (method !== req.method) continue;
      const m = pathname.match(re);
      if (m) return routes[key](req, res, m.slice(1).map(decodeURIComponent));
    }
    return send(res, 404, { error: '接口不存在' });
  }

  send(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log('工作台已启动: http://localhost:' + PORT);
  console.log('博客目录: ' + BLOG_ROOT);
});
