# 伯爵 · Radio Dramas — Production Deploy

Ready-to-deploy static site. No build step needed: the whole folder is the site.

## Quick deploy

### Netlify (easiest, drag & drop)
1. Go to https://app.netlify.com/drop
2. Drag this folder (or the bojue-site.zip) onto the page
3. Done — you get a `*.netlify.app` URL; in Site settings you can attach your own domain

### Vercel
1. https://vercel.com/new → upload project folder (or `npx vercel` in this folder)
2. Framework preset: Other / Static — no build command, output = current folder

### GitHub Pages
1. Create a repo, push this folder (or use `gh-pages` branch)
2. Repo Settings → Pages → deploy from branch

### Cloudflare Pages
1. https://dash.cloudflare.com → Workers & Pages → Create → Direct Upload
2. Upload this folder

## After deploy, update these in index.html
- `og:url` → your real domain
- `og:image` → an absolute URL of a cover image on your domain (currently points to the original template's image)

## What was removed for production
- In-browser edit mode (Edit button, inline text editing, image replace, /api/edits + /api/image)
- The local static server (serve.cjs) and auto-save watcher (watch-save.cjs)

Those are local-authoring tools that need a backend; a static host serves the read-only site.
To edit content again: keep using the local copy at ../baseline (localhost:8917), then re-export.

## Note
The layout/design is derived from Yichen Xie's public portfolio (yichenxie.com) with your own
content and identity. Consider keeping a small credit line in the footer if you publish it.
