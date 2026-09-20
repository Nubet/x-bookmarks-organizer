export function normalizeFolderName(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}

export function folderNameKey(name: string) {
  return normalizeFolderName(name).toLocaleLowerCase()
}

export function addFolderIds(currentIds: string[], folderIds: string[]) {
  return Array.from(new Set([...currentIds, ...folderIds]))
}

export function removeFolderIds(currentIds: string[], folderIds: string[]) {
  const removed = new Set(folderIds)
  return currentIds.filter((folderId) => !removed.has(folderId))
}
