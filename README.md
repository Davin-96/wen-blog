# 阿文的博客

一个 Astro 静态博客 + 本机工作台。文章是仓库里的 Markdown，主题样式运行时注入，工作台增改内容、调整风格，推送即发布。

## 目录结构

```
blog/
├── public/
│   ├── theme.json          # 主题配置（工作台编辑）
│   └── favicon.svg
├── src/
│   ├── content/posts/      # 文章（工作台编辑）
│   ├── layouts/            # BaseLayout / PostCard
│   ├── styles/global.css   # 全局样式（CSS 变量驱动）
│   └── pages/              # 首页 / 文章 / 项目 / 友链 / 关于
├── admin/                  # 工作台（本机 Node 应用）
└── .github/workflows/      # GitHub Pages 自动部署
```

## 本地预览

```bash
npm install
npm run dev      # http://localhost:4321
npm run build   # 产物在 dist/
```

## 工作台

```bash
npm run admin      # 或 node admin/server.mjs
# 打开 http://localhost:8321
```

功能：
- **文章**：写新、编辑、删除 Markdown 文章，左侧编辑右侧实时预览
- **主题**：配色（主色/背景/卡片/边框/文字）、字号、行距、圆角、阅读栏宽度、字体族，右侧实时预览，保存后前台即时生效
- **发布**：查看 git 状态、填写提交说明、提交并推送到 GitHub（推送后 GitHub Actions 自动构建部署）

## 发布流程

工作台保存 → git commit & push → GitHub Actions 自动构建部署到 Pages。
