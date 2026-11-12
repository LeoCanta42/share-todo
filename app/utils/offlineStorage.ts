import type { JwtPayload } from '@supabase/supabase-js'
import type { TodoWithGroup, TodoShare } from '../types/todo'
import type { NoteWithGroup } from '../types/note'
import type { Group } from '../types/group'
import type { Profile } from '../types/profile'

export type MutationType =
  | 'todo:insert'
  | 'todo:update'
  | 'todo:delete'
  | 'note:insert'
  | 'note:update'
  | 'note:delete'
  | 'group:insert'
  | 'group:update'
  | 'group:delete'

export interface OfflineMutation {
  id: string
  type: MutationType
  tempId?: number | string
  targetId?: number | string
  payload?: any
  createdAt: number
}

const STORAGE_KEYS = {
  USER: 'sharetodo:offline:user',
  PROFILE: 'sharetodo:offline:profile',
  TODOS: 'sharetodo:offline:todos',
  NOTES: 'sharetodo:offline:notes',
  GROUPS: 'sharetodo:offline:groups',
  SHARES: 'sharetodo:offline:shares',
  MUTATIONS: 'sharetodo:offline:mutations',
  LOGGED_OUT: 'sharetodo:offline:logged_out'
} as const

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function getItem<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback
  try {
    const item = window.localStorage.getItem(key)
    if (!item) return fallback
    return JSON.parse(item) as T
  } catch (err) {
    console.warn(`[offlineStorage] Failed to read ${key}:`, err)
    return fallback
  }
}

function setItem<T>(key: string, value: T): void {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.warn(`[offlineStorage] Failed to write ${key}:`, err)
  }
}

function removeItem(key: string): void {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(key)
  } catch (err) {
    console.warn(`[offlineStorage] Failed to remove ${key}:`, err)
  }
}

export const offlineStorage = {
  // ------------------------------------------------------------- User
  getUser(): JwtPayload | null {
    return getItem<JwtPayload | null>(STORAGE_KEYS.USER, null)
  },
  setUser(user: JwtPayload | null): void {
    if (user) {
      setItem(STORAGE_KEYS.USER, user)
      removeItem(STORAGE_KEYS.LOGGED_OUT)
    } else {
      removeItem(STORAGE_KEYS.USER)
    }
  },
  clearUser(): void {
    removeItem(STORAGE_KEYS.USER)
  },

  // ------------------------------------------------------------- Profile
  getProfile(): Profile | null {
    return getItem<Profile | null>(STORAGE_KEYS.PROFILE, null)
  },
  setProfile(profile: Profile | null): void {
    if (profile) {
      setItem(STORAGE_KEYS.PROFILE, profile)
    } else {
      removeItem(STORAGE_KEYS.PROFILE)
    }
  },
  clearProfile(): void {
    removeItem(STORAGE_KEYS.PROFILE)
  },

  // ------------------------------------------------------------- Todos
  getTodos(): TodoWithGroup[] {
    return getItem<TodoWithGroup[]>(STORAGE_KEYS.TODOS, [])
  },
  setTodos(todos: TodoWithGroup[]): void {
    setItem(STORAGE_KEYS.TODOS, todos)
  },
  clearTodos(): void {
    removeItem(STORAGE_KEYS.TODOS)
  },

  // ------------------------------------------------------------- Notes
  getNotes(): NoteWithGroup[] {
    return getItem<NoteWithGroup[]>(STORAGE_KEYS.NOTES, [])
  },
  setNotes(notes: NoteWithGroup[]): void {
    setItem(STORAGE_KEYS.NOTES, notes)
  },
  clearNotes(): void {
    removeItem(STORAGE_KEYS.NOTES)
  },

  // ------------------------------------------------------------- Groups
  getGroups(): Group[] {
    return getItem<Group[]>(STORAGE_KEYS.GROUPS, [])
  },
  setGroups(groups: Group[]): void {
    setItem(STORAGE_KEYS.GROUPS, groups)
  },
  clearGroups(): void {
    removeItem(STORAGE_KEYS.GROUPS)
  },

  // ------------------------------------------------------------- Shares
  getShares(): { myShares: TodoShare[]; receivedShares: TodoShare[] } {
    return getItem<{ myShares: TodoShare[]; receivedShares: TodoShare[] }>(
      STORAGE_KEYS.SHARES,
      { myShares: [], receivedShares: [] }
    )
  },
  setShares(shares: { myShares: TodoShare[]; receivedShares: TodoShare[] }): void {
    setItem(STORAGE_KEYS.SHARES, shares)
  },
  clearShares(): void {
    removeItem(STORAGE_KEYS.SHARES)
  },

  // ------------------------------------------------------------- Mutation queue
  getMutations(): OfflineMutation[] {
    return getItem<OfflineMutation[]>(STORAGE_KEYS.MUTATIONS, [])
  },
  setMutations(mutations: OfflineMutation[]): void {
    setItem(STORAGE_KEYS.MUTATIONS, mutations)
  },
  addMutation(mutation: OfflineMutation): void {
    const list = this.getMutations()
    list.push(mutation)
    this.setMutations(list)
  },
  removeMutation(id: string): void {
    const list = this.getMutations().filter(m => m.id !== id)
    this.setMutations(list)
  },
  clearMutations(): void {
    removeItem(STORAGE_KEYS.MUTATIONS)
  },

  // ------------------------------------------------------------- Explicit Logout
  isLoggedOut(): boolean {
    return getItem<boolean>(STORAGE_KEYS.LOGGED_OUT, false)
  },
  setLoggedOut(value: boolean): void {
    if (value) {
      setItem(STORAGE_KEYS.LOGGED_OUT, true)
    } else {
      removeItem(STORAGE_KEYS.LOGGED_OUT)
    }
  },

  // ------------------------------------------------------------- Wipe all
  clearAll(): void {
    this.clearUser()
    this.clearProfile()
    this.clearTodos()
    this.clearNotes()
    this.clearGroups()
    this.clearShares()
    this.clearMutations()
    this.setLoggedOut(true)
  }
}
