import type { MetaKey, Note, ThemePreference } from './types'

const DB_NAME = 'notes_db'
const DB_VERSION = 1
const NOTES_STORE = 'notes'
const META_STORE = 'meta'
const LOCAL_NOTES_KEY = 'notes_db_notes'
const LOCAL_META_KEY = 'notes_db_meta'

export type StorageDriver = {
  getAllNotes: () => Promise<Note[]>
  getNote: (id: string) => Promise<Note | undefined>
  saveNote: (note: Note) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  bulkSaveNotes: (notes: Note[]) => Promise<void>
  clearAllNotes: () => Promise<void>
  getMeta: (key: MetaKey) => Promise<string | undefined>
  setMeta: (key: MetaKey, value: string) => Promise<void>
}

const isIndexedDbAvailable = () => {
  try {
    return typeof indexedDB !== 'undefined'
  } catch {
    return false
  }
}

const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        db.createObjectStore(NOTES_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const runTransaction = <T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  task: (store: IDBObjectStore) => IDBRequest<T>,
) =>
  new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)
    const request = task(store)

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const createIndexedDbDriver = async (): Promise<StorageDriver> => {
  const db = await openDb()

  return {
    async getAllNotes() {
      return runTransaction(db, NOTES_STORE, 'readonly', (store) => store.getAll())
    },
    async getNote(id) {
      return runTransaction(db, NOTES_STORE, 'readonly', (store) => store.get(id))
    },
    async saveNote(note) {
      await runTransaction(db, NOTES_STORE, 'readwrite', (store) => store.put(note))
    },
    async deleteNote(id) {
      await runTransaction(db, NOTES_STORE, 'readwrite', (store) => store.delete(id))
    },
    async bulkSaveNotes(notes) {
      const transaction = db.transaction(NOTES_STORE, 'readwrite')
      const store = transaction.objectStore(NOTES_STORE)
      await new Promise<void>((resolve, reject) => {
        notes.forEach((note) => store.put(note))
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      })
    },
    async clearAllNotes() {
      await runTransaction(db, NOTES_STORE, 'readwrite', (store) => store.clear())
    },
    async getMeta(key) {
      const result = await runTransaction<{ key: string; value: string } | undefined>(
        db,
        META_STORE,
        'readonly',
        (store) => store.get(key),
      )
      return result?.value
    },
    async setMeta(key, value) {
      await runTransaction(db, META_STORE, 'readwrite', (store) => store.put({ key, value }))
    },
  }
}

const getLocalNotes = (): Note[] => {
  try {
    const raw = localStorage.getItem(LOCAL_NOTES_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Note[]
  } catch {
    return []
  }
}

const setLocalNotes = (notes: Note[]) => {
  localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(notes))
}

const getLocalMeta = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(LOCAL_META_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
  }
}

const setLocalMeta = (meta: Record<string, string>) => {
  localStorage.setItem(LOCAL_META_KEY, JSON.stringify(meta))
}

const createLocalStorageDriver = (): StorageDriver => ({
  async getAllNotes() {
    return getLocalNotes()
  },
  async getNote(id) {
    return getLocalNotes().find((note) => note.id === id)
  },
  async saveNote(note) {
    const notes = getLocalNotes()
    const index = notes.findIndex((item) => item.id === note.id)
    if (index >= 0) {
      notes[index] = note
    } else {
      notes.push(note)
    }
    setLocalNotes(notes)
  },
  async deleteNote(id) {
    const notes = getLocalNotes().filter((note) => note.id !== id)
    setLocalNotes(notes)
  },
  async bulkSaveNotes(notes) {
    setLocalNotes(notes)
  },
  async clearAllNotes() {
    setLocalNotes([])
  },
  async getMeta(key) {
    const meta = getLocalMeta()
    return meta[key]
  },
  async setMeta(key, value) {
    const meta = getLocalMeta()
    meta[key] = value
    setLocalMeta(meta)
  },
})

const createMemoryDriver = (): StorageDriver => {
  let notes: Note[] = []
  let meta: Record<string, string> = {}

  return {
    async getAllNotes() {
      return notes
    },
    async getNote(id) {
      return notes.find((note) => note.id === id)
    },
    async saveNote(note) {
      const index = notes.findIndex((item) => item.id === note.id)
      if (index >= 0) {
        notes[index] = note
      } else {
        notes = [...notes, note]
      }
    },
    async deleteNote(id) {
      notes = notes.filter((note) => note.id !== id)
    },
    async bulkSaveNotes(allNotes) {
      notes = allNotes
    },
    async clearAllNotes() {
      notes = []
    },
    async getMeta(key) {
      return meta[key]
    },
    async setMeta(key, value) {
      meta = { ...meta, [key]: value }
    },
  }
}

let storagePromise: Promise<StorageDriver> | null = null

export const getStorage = () => {
  if (!storagePromise) {
    storagePromise = (async () => {
      if (!isIndexedDbAvailable()) {
        return createLocalStorageDriver()
      }
      try {
        return await createIndexedDbDriver()
      } catch (error) {
        console.warn('IndexedDB unavailable, falling back to localStorage.', error)
        try {
          return createLocalStorageDriver()
        } catch (localError) {
          console.warn('localStorage unavailable, using memory fallback.', localError)
          return createMemoryDriver()
        }
      }
    })()
  }
  return storagePromise
}

export const sanitizeTheme = (value?: string | null): ThemePreference => {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value
  }
  return 'system'
}
