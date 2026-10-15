# Wiki-documentation

A personal knowledge base built with **React + TypeScript**, designed to write, organize, and explore Markdown documents — with a built-in JavaScript playground.

---

## What it does

- **Write & organize** Markdown docs grouped into custom categories
- **Search** across all your documents in real time
- **Read** rendered Markdown with syntax-highlighted code blocks
- **Run JavaScript** snippets directly in the built-in playground (multi-file, with live preview and console output)
- **Import** `.md` files from your machine and **export** them at any time
- **Sync** everything to a GitHub Gist so your content is always backed up and shareable

---

## Two modes

### Viewer (default)
Read-only mode. The app loads the wiki content from the configured GitHub Gist **without requiring any credentials**. Perfect for sharing your docs with others — just give them the Gist ID and they can browse the content instantly.

### Admin
Full editing mode. Requires a **GitHub Personal Access Token** with the `gist` scope. In this mode you can create, edit, and delete documents and categories. Every change is automatically pushed back to the Gist (debounced, ~60 seconds), keeping the remote copy up to date. Switch to Admin via the mode toggle in the top bar.

---

## Data storage — GitHub Gist

All content is stored remotely as a single JSON file **private GitHub Gist**.
You can either **connect to an existing Gist** (paste the ID or URL) or let the app **create a new one** automatically. The Gist ID is saved locally so the app reconnects on the next visit.

> **First launch:** if no Gist is configured, a setup dialog will open automatically to guide you through the connection.

---

Link: https://wikidocumentation.vercel.app
