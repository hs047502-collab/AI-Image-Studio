# MD: Abdul Ahad — 120-Style AI Image Studio

A Node.js image-generation studio with 120 art styles, free/community model routes, optional server-side paid/API providers, a browser gallery ZIP download, and a GitHub-ready style-settings CSV.

## What's included

- `public/index.html` — studio UI and embedded style/prompt engine.
- `server.js` — Node/Express backend; provider secrets stay on the server.
- `.env.example` — blank configuration template. **Never commit your real `.env` or API keys.**
- `STYLE-RECOMMENDATIONS-120.csv` — one recommendation row for each of the 120 styles, with universal and family-specific settings.
- `scripts/generate-style-guide.js` — regenerates the CSV from the same style recommendations used by the studio.
- `README_BN.md` — Bengali setup, provider, billing, and security notes.

Flat Vector and Clean Commercial Vector use scene-aware defaults (4:3, contextual background, limited flat palette, crisp edges, and full-scene framing). Prompt recipes are still applied to detailed prompts. PNG/JPG output is raster artwork, not an editable SVG file.

## Quick start

Requires Node.js 20 or newer.

```bash
npm ci
```

Free/community routes can be tried without paid-provider keys. To configure providers, copy `.env.example` to `.env`, add only the keys you need, and keep `.env` private. Then start the server:

```bash
npm start
```

Open `http://localhost:3000`. Review `README_BN.md` and `.env.example` for setup, billing, and security details. If exposing the server publicly, configure a strong `STUDIO_ACCESS_KEY`, HTTPS, hosting-layer access controls, and rate limits before use.

## CSV

`STYLE-RECOMMENDATIONS-120.csv` contains exactly 120 style rows. To regenerate it after changing the style registry or recommendation presets:

```bash
npm run generate:style-csv
```

Free/community output dimensions vary by model and are not guaranteed to be 2K. Premium/API requests may incur charges; check the provider's current pricing and credits. Actual image quality and dimensions depend on the selected provider and prompt.

## GitHub and licensing

This source bundle intentionally excludes `.env`, `node_modules`, and Git history; `.gitignore` is included. Unzip into a folder and upload/commit the extracted project contents to a new repository. Uploading source to GitHub does **not** deploy or run the Node.js app; use a Node.js host if you want a live website. A public GitHub URL also does not automatically grant reuse rights—add a license if you want to specify terms.


## OpenRouter image generation

Create an OpenRouter API key and add it to the project-root `.env` file as `OPENROUTER_API_KEY=...` (never put the key in frontend HTML). Run `npm install` and `npm start`, then choose **OpenRouter • Dynamic Image Models** in AI Model Engine. The app fetches image-output-capable models from OpenRouter and sends generation requests through the server. Model availability and pricing vary; check the selected model's OpenRouter pricing before generating.
