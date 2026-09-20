import {createAccountDatabase, type BookmarkDatabase} from './database'

export class AccountDatabaseManager {
  private readonly databases = new Map<string, Promise<BookmarkDatabase>>()

  open(accountId: string) {
    const existing = this.databases.get(accountId)
    if (existing) return existing

    const database = createAccountDatabase(accountId)
    const ready = database.open().then(() => database)
    this.databases.set(accountId, ready)
    return ready
  }

  async close(accountId: string) {
    const database = await this.databases.get(accountId)
    if (!database) return

    database.close()
    this.databases.delete(accountId)
  }
}

export const accountDatabases = new AccountDatabaseManager()
