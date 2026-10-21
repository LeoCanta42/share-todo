import type { TodoWithGroup, TodoShare } from '~/types/todo'
import type { NoteWithGroup } from '~/types/note'
import type { Group } from '~/types/group'
import type { Profile } from '~/types/profile'

export type SyncEntityType = 'todo' | 'group' | 'note'

export type SyncActionType =
  | 'create_todo'
  | 'update_todo'
  | 'delete_todo'
  | 'toggle_todos'
  | 'clear_completed_todos'
  | 'create_note'
  | 'update_note'
  | 'delete_note'
  | 'create_group'
  | 'rename_group'
  | 'set_group_look'
  | 'move_group'
  | 'delete_group'

export interface SyncQueueItem {
  id: string
  timestamp: number
  type: SyncActionType
  entity: SyncEntityType
  entityId?: string | number
  payload: any
  retryCount?: number
  lastError?: string
}

const DB_NAME = 'sharetodo_offline_db'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function getIndexedDB(): IDBFactory | null {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return null
  }
  return window.indexedDB
}

export function openOfflineDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  const idb = getIndexedDB()
  if (!idb) {
    return Promise.reject(new Error('IndexedDB not supported or unavailable in this environment'))
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = idb.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = request.result

      // Store: todos (key: id)
      if (!db.objectStoreNames.contains('todos')) {
        db.createObjectStore('todos', { keyPath: 'id' })
      }

      // Store: groups (key: id)
      if (!db.objectStoreNames.contains('groups')) {
        db.createObjectStore('groups', { keyPath: 'id' })
      }

      // Store: notes (key: id)
      if (!db.objectStoreNames.contains('notes')) {
        db.createObjectStore('notes', { keyPath: 'id' })
      }

      // Store: shares (single key or keyed by name)
      if (!db.objectStoreNames.contains('shares')) {
        db.createObjectStore('shares')
      }

      // Store: profile (single key 'current')
      if (!db.objectStoreNames.contains('profile')) {
        db.createObjectStore('profile')
      }

      // Store: sync_queue (key: id)
      if (!db.objectStoreNames.contains('sync_queue')) {
        const queueStore = db.createObjectStore('sync_queue', { keyPath: 'id' })
        queueStore.createIndex('timestamp', 'timestamp', { unique: false })
      }

      // Store: meta (key: string key)
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta')
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      console.error('[offlineDb] Error opening database:', request.error)
      dbPromise = null
      reject(request.error)
    }

    request.onblocked = () => {
      console.warn('[offlineDb] Database open blocked by another tab')
    }
  })

  return dbPromise
}

async function getStore(storeName: string, mode: IDBTransactionMode): Promise<{ store: IDBObjectStore, tx: IDBTransaction }> {
  const db = await openOfflineDatabase()
  const tx = db.transaction(storeName, mode)
  const store = tx.objectStore(storeName)
  return { store, tx }
}

/* ============================================================== TODOS */

export async function getCachedTodos(): Promise<TodoWithGroup[]> {
  try {
    const { store } = await getStore('todos', 'readonly')
    return new Promise((resolve, reject) => {
      const req = store.getAll()
      req.onsuccess = () => resolve((req.result as TodoWithGroup[]) || [])
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('[offlineDb] getCachedTodos failed:', err)
    return []
  }
}

export async function setCachedTodos(todos: TodoWithGroup[]): Promise<void> {
  try {
    const { store, tx } = await getStore('todos', 'readwrite')
    store.clear()
    for (const todo of todos) {
      store.put(todo)
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[offlineDb] setCachedTodos failed:', err)
  }
}

export async function putCachedTodo(todo: TodoWithGroup): Promise<void> {
  try {
    const { store, tx } = await getStore('todos', 'readwrite')
    store.put(todo)
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[offlineDb] putCachedTodo failed:', err)
  }
}

export async function removeCachedTodo(id: number): Promise<void> {
  try {
    const { store, tx } = await getStore('todos', 'readwrite')
    store.delete(id)
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[offlineDb] removeCachedTodo failed:', err)
  }
}

/* ============================================================= GROUPS */

export async function getCachedGroups(): Promise<Group[]> {
  try {
    const { store } = await getStore('groups', 'readonly')
    return new Promise((resolve, reject) => {
      const req = store.getAll()
      req.onsuccess = () => resolve((req.result as Group[]) || [])
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('[offlineDb] getCachedGroups failed:', err)
    return []
  }
}

export async function setCachedGroups(groups: Group[]): Promise<void> {
  try {
    const { store, tx } = await getStore('groups', 'readwrite')
    store.clear()
    for (const group of groups) {
      store.put(group)
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[offlineDb] setCachedGroups failed:', err)
  }
}

export async function putCachedGroup(group: Group): Promise<void> {
  try {
    const { store, tx } = await getStore('groups', 'readwrite')
    store.put(group)
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[offlineDb] putCachedGroup failed:', err)
  }
}

export async function removeCachedGroup(id: string): Promise<void> {
  try {
    const { store, tx } = await getStore('groups', 'readwrite')
    store.delete(id)
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[offlineDb] removeCachedGroup failed:', err)
  }
}

/* ============================================================== NOTES */

export async function getCachedNotes(): Promise<NoteWithGroup[]> {
  try {
    const { store } = await getStore('notes', 'readonly')
    return new Promise((resolve, reject) => {
      const req = store.getAll()
      req.onsuccess = () => resolve((req.result as NoteWithGroup[]) || [])
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('[offlineDb] getCachedNotes failed:', err)
    return []
  }
}

export async function setCachedNotes(notes: NoteWithGroup[]): Promise<void> {
  try {
    const { store, tx } = await getStore('notes', 'readwrite')
    store.clear()
    for (const note of notes) {
      store.put(note)
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[offlineDb] setCachedNotes failed:', err)
  }
}

export async function putCachedNote(note: NoteWithGroup): Promise<void> {
  try {
    const { store, tx } = await getStore('notes', 'readwrite')
    store.put(note)
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[offlineDb] putCachedNote failed:', err)
  }
}

export async function removeCachedNote(id: number): Promise<void> {
  try {
    const { store, tx } = await getStore('notes', 'readwrite')
    store.delete(id)
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[offlineDb] removeCachedNote failed:', err)
  }
}

/* ============================================================= SHARES */

export interface CachedSharesData {
  myShares: TodoShare[]
  receivedShares: TodoShare[]
}

export async function getCachedShares(): Promise<CachedSharesData | null> {
  try {
    const { store } = await getStore('shares', 'readonly')
    return new Promise((resolve, reject) => {
      const req = store.get('shares_bundle')
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('[offlineDb] getCachedShares failed:', err)
    return null
  }
}

export async function setCachedShares(data: CachedSharesData): Promise<void> {
  try {
    const { store, tx } = await getStore('shares', 'readwrite')
    store.put(data, 'shares_bundle')
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[offlineDb] setCachedShares failed:', err)
  }
}

/* ============================================================ PROFILE */

export async function getCachedProfile(): Promise<Profile | null> {
  try {
    const { store } = await getStore('profile', 'readonly')
    return new Promise((resolve, reject) => {
      const req = store.get('current')
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('[offlineDb] getCachedProfile failed:', err)
    return null
  }
}

export async function setCachedProfile(profile: Profile | null): Promise<void> {
  try {
    const { store, tx } = await getStore('profile', 'readwrite')
    if (profile) {
      store.put(profile, 'current')
    } else {
      store.delete('current')
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[offlineDb] setCachedProfile failed:', err)
  }
}

/* ========================================================= SYNC QUEUE */

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  try {
    const { store } = await getStore('sync_queue', 'readonly')
    return new Promise((resolve, reject) => {
      const req = store.getAll()
      req.onsuccess = () => {
        const items = (req.result as SyncQueueItem[]) || []
        // Sort in chronological order
        items.sort((a, b) => a.timestamp - b.timestamp)
        resolve(items)
      }
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('[offlineDb] getSyncQueue failed:', err)
    return []
  }
}

export async function addSyncQueueItem(
  item: Omit<SyncQueueItem, 'id' | 'timestamp'> & { id?: string, timestamp?: number }
): Promise<SyncQueueItem> {
  const fullItem: SyncQueueItem = {
    id: item.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sq_${Date.now()}_${Math.random()}`),
    timestamp: item.timestamp || Date.now(),
    type: item.type,
    entity: item.entity,
    entityId: item.entityId,
    payload: item.payload,
    retryCount: item.retryCount || 0,
    lastError: item.lastError
  }

  try {
    const { store, tx } = await getStore('sync_queue', 'readwrite')
    store.put(fullItem)
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(fullItem)
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[offlineDb] addSyncQueueItem failed:', err)
    return fullItem
  }
}

export async function updateSyncQueueItem(item: SyncQueueItem): Promise<void> {
  try {
    const { store, tx } = await getStore('sync_queue', 'readwrite')
    store.put(item)
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[offlineDb] updateSyncQueueItem failed:', err)
  }
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  try {
    const { store, tx } = await getStore('sync_queue', 'readwrite')
    store.delete(id)
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[offlineDb] removeSyncQueueItem failed:', err)
  }
}

export async function removeSyncQueueItemsForEntity(entityId: string | number): Promise<void> {
  try {
    const { store, tx } = await getStore('sync_queue', 'readwrite')
    const req = store.getAll()
    req.onsuccess = () => {
      const items = (req.result as SyncQueueItem[]) || []
      for (const item of items) {
        if (item.entityId === entityId) {
          store.delete(item.id)
        }
      }
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[offlineDb] removeSyncQueueItemsForEntity failed:', err)
  }
}

export async function clearSyncQueue(): Promise<void> {
  try {
    const { store, tx } = await getStore('sync_queue', 'readwrite')
    store.clear()
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[offlineDb] clearSyncQueue failed:', err)
  }
}

/* =============================================================== META */

export async function getLastSyncTime(): Promise<number | null> {
  try {
    const { store } = await getStore('meta', 'readonly')
    return new Promise((resolve, reject) => {
      const req = store.get('last_sync_timestamp')
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('[offlineDb] getLastSyncTime failed:', err)
    return null
  }
}

export async function setLastSyncTime(timestamp: number): Promise<void> {
  try {
    const { store, tx } = await getStore('meta', 'readwrite')
    store.put(timestamp, 'last_sync_timestamp')
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[offlineDb] setLastSyncTime failed:', err)
  }
}

export async function clearAllLocalData(): Promise<void> {
  try {
    const db = await openOfflineDatabase()
    const stores = ['todos', 'groups', 'notes', 'shares', 'profile', 'sync_queue', 'meta']
    const tx = db.transaction(stores, 'readwrite')
    for (const name of stores) {
      tx.objectStore(name).clear()
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[offlineDb] clearAllLocalData failed:', err)
  }
}
