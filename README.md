# My Tasks (mytasuku)

A simple, local-first task manager with a focus timer, history, and achievements. Runs entirely in the browser and installs as a PWA.

**Live site:** https://mytasuku.netlify.app/

## Features

- Add tasks with date, time, repeat, priority, and category
- "Surprise me" button for a random task idea
- Views: All, Today / Upcoming, To Do, In Progress, Done, History
- Focus timer and achievements
- Manual ordering plus sorting
- Four color palettes: Forest, Ocean, Sunset, Candy
- Light and dark mode support
- Installable PWA with offline support (service worker)

## Keyboard shortcuts

| Key   | Action          |
|-------|-----------------|
| `N`   | New task        |
| `/`   | Search          |
| `1`–`8` | Switch tabs   |

## Project structure

```
index.html      App markup
style.css       Styles and palettes
script.js       App logic
sw.js           Service worker (offline cache)
manifest.json   PWA manifest
tasky.ico       Favicon
*.png           Palette preview images
```

## Run locally

There is no build step. Serve the folder with any static server (a service worker needs `http://localhost`, not `file://`):

```bash
python3 -m http.server 8000
# or
npx serve .
```

Then open http://localhost:8000.

## Deploy

The site is hosted on Netlify and deploys automatically from the `main` branch.

## Data

Tasks are stored locally in your browser. Nothing is sent to a server.
