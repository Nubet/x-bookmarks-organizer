<img src="./banner/x-bookmarks-organizer-banner.png" alt="X Bookmarks Organizer banner" width="100%">

# X Bookmarks Organizer

Turn the bookmarks you save on X into a library you can actually use.

X is good at helping you save posts. It is not very good at helping you find them again. **X Bookmarks Organizer** adds a faster, more focused workspace directly to X for searching, filtering, sorting, organizing, and cleaning up your saved posts.

## Why this exists

Bookmarks are often used as a personal research inbox: articles to read, ideas to revisit, tools to try, and posts worth sharing later. Once that list grows, the default bookmarks view becomes difficult to navigate.

This extension gives that collection structure without sending it to another service or forcing you to maintain a separate database.

## Features

- **Search your library:** Search saved posts by text, author (`@username`), or hashtag (`#topic`).
- **Fast local search:** Search is performed against an indexed local library instead of repeatedly scanning the page.
- **Folders:** Create folders and assign bookmarks to multiple folders, such as `Read later`, `Ideas`, `Tools`, or `Research`.
- **Folder browsing:** Open a folder and search the full folder contents.
- **Media filters:** Quickly narrow the library to posts containing images, videos, GIFs, links, or other media.
- **Bulk selection:** Select visible bookmarks and apply folder actions or remove multiple bookmarks at once.
- **Pagination:** Load large libraries incrementally instead of rendering everything at once.
- **Local-first storage:** Your organized library is stored locally in the browser with IndexedDB through Dexie.
- **Works inside X:** The organizer replaces the standard bookmarks view on `x.com`.

## How to use

1. Install and open the extension on X.
2. Open the **Bookmarks** page.
3. Run **Sync** to bring your X bookmarks into the local library.
4. Search for a post, filter by media, or select a folder.
5. Select one or more bookmarks to add them to folders or remove them.
6. Return later and use folders, search, or sorting to find what you saved.

The extension keeps the local library separate from the X page until you choose to sync or perform an action. This makes browsing fast and avoids reloading the entire bookmark list for every search.

## Privacy and data

- Bookmark data is stored locally in your browser.
- The extension does not use a separate analytics or bookmark-hosting service.
- It only integrates with X pages needed to read, sync, and manage your bookmarks.

## Supported browsers

- Google Chrome and other Chromium-based browsers
- Firefox
- Microsoft Edge

The project is built with React, TypeScript, Dexie, and Extension.js.

## Install from source

```bash
npm install
npm run build:chrome
```

Then load the generated `dist/chrome` directory as an unpacked extension in Chrome or Edge. For Firefox, build the Firefox target instead:

```bash
npm run build:firefox
```

Load the generated Firefox build through `about:debugging`.

## Architecture

- `src/content`: the organizer UI injected into X.
- `src/domain`: search, sorting, media detection, and folder rules.
- `src/application`: application actions for bookmarks and folders.
- `src/storage`: Dexie database, migrations, and repositories.
- `src/background.ts`: runtime message handling and extension coordination.
- `src/popup`: settings and manual sync controls.

The codebase is intentionally local-first: the UI reads from the local library, while sync and remote bookmark changes are explicit operations.

## Author

**Norbert Fila**

## License

MIT
