# Store metadata

Last updated: 2026-09-21

## Listing

- Name: x-bookmarks-organizer
- Summary: Organizes X bookmarks in a local browser library.
- Description: Search, filter, sort, and organize X bookmarks in a fast local library. Create folders, manage multiple bookmarks at once, and sync changes from X without sending bookmark data to a separate service.
- Category: Productivity
- Screenshots: TODO at least one 1280x800 screenshot per store.

## Privacy and data use

- The current build stores extension settings and bookmark metadata locally in IndexedDB.
- The manifest declares data_collection_permissions: none for
  Firefox, which matches this behavior. If you add data collection,
  update the declaration, this section, and your privacy policy in
  the same change.
- Privacy policy URL: TODO required by every store once you collect
  any data.

## Chrome Web Store

### Single purpose

Organizes X bookmarks in a local browser library.

### Permissions justification

- No extra permission is required for IndexedDB local storage.
- Content script matches x.com and twitter.com: The content script will provide the on-page bookmark interface.

## Firefox Add-ons

### Reviewer notes

TODO steps a reviewer needs to exercise the extension, plus test
credentials if sign-in is required. The build is bundled, so AMO
requires a source zip; include build-from-source instructions:
npm install, then npm run build. The dist output matches the upload.

### Release notes

Version 1.0.0 ships:

- Local IndexedDB bookmark library
- Search, filters, sorting, and pagination
- Folders and bulk bookmark actions
- Manual and automatic synchronization with X
- Organizer view that replaces the default X Bookmarks page

## Edge Add-ons

### Certification notes

TODO anything the certification team needs to test the extension,
including test steps and credentials. Mirrors the Firefox reviewer
notes in most cases.

## Version history

- 1.0.0 (released): Initial release with local bookmark organization, search, folders, bulk actions, and X synchronization.
