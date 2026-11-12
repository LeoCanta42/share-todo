import test from 'node:test'
import assert from 'node:assert/strict'

// Create a mock window with localStorage for testing offlineStorage
class MockLocalStorage {
  private store: Map<string, string> = new Map()

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}

// Polyfill global window and localStorage
const mockStorage = new MockLocalStorage()
;(globalThis as any).window = {
  localStorage: mockStorage
}
;(globalThis as any).localStorage = mockStorage

const fakeNavigator = { onLine: true }
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: fakeNavigator,
    configurable: true,
    writable: true
  })
} catch {
  // If property already exists and is non-configurable
}

// Dynamic import of offlineStorage and network
const { offlineStorage } = await import('../app/utils/offlineStorage.ts')
const { isNetworkError } = await import('../app/utils/network.ts')

test('offlineStorage manages user authentication state', () => {
  offlineStorage.clearAll()

  assert.equal(offlineStorage.getUser(), null)
  assert.equal(offlineStorage.isLoggedOut(), true)

  const fakeUser = { sub: 'user-123', email: 'test@example.com' }
  offlineStorage.setUser(fakeUser)

  assert.deepEqual(offlineStorage.getUser(), fakeUser)
  assert.equal(offlineStorage.isLoggedOut(), false)

  offlineStorage.clearUser()
  assert.equal(offlineStorage.getUser(), null)
})

test('offlineStorage manages profile caching', () => {
  const fakeProfile = {
    id: 'user-123',
    approved: true,
    is_admin: false,
    email: 'test@example.com',
    created_at: new Date().toISOString(),
    approved_at: null,
    approved_by: null
  }

  offlineStorage.setProfile(fakeProfile)
  assert.deepEqual(offlineStorage.getProfile(), fakeProfile)

  offlineStorage.clearProfile()
  assert.equal(offlineStorage.getProfile(), null)
})

test('offlineStorage manages todos caching', () => {
  const fakeTodos = [
    {
      id: 1,
      title: 'Task 1',
      completed: false,
      group_id: null,
      group_name: 'Generale',
      group: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      due_at: null,
      due_all_day: false,
      reminder_at: null,
      reminder_minutes: null,
      reminder_sent_at: null,
      timezone: 'UTC',
      user_id: 'user-123'
    }
  ]

  offlineStorage.setTodos(fakeTodos as any)
  assert.deepEqual(offlineStorage.getTodos(), fakeTodos)

  offlineStorage.clearTodos()
  assert.deepEqual(offlineStorage.getTodos(), [])
})

test('offlineStorage manages notes caching', () => {
  const fakeNotes = [
    {
      id: 10,
      title: 'Note 1',
      body: 'Note body text',
      group_id: null,
      group_name: 'Generale',
      group: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: 'user-123'
    }
  ]

  offlineStorage.setNotes(fakeNotes as any)
  assert.deepEqual(offlineStorage.getNotes(), fakeNotes)

  offlineStorage.clearNotes()
  assert.deepEqual(offlineStorage.getNotes(), [])
})

test('offlineStorage manages groups caching', () => {
  const fakeGroups = [
    {
      id: 'grp-1',
      name: 'Lavoro',
      parent_id: null,
      depth: 0,
      path: ['grp-1'],
      tone: 'emerald',
      icon: 'briefcase',
      owner_id: 'user-123',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ]

  offlineStorage.setGroups(fakeGroups as any)
  assert.deepEqual(offlineStorage.getGroups(), fakeGroups)

  offlineStorage.clearGroups()
  assert.deepEqual(offlineStorage.getGroups(), [])
})

test('offlineStorage manages shares caching', () => {
  const fakeShares = {
    myShares: [
      {
        id: 1,
        owner_id: 'user-123',
        group_id: 'grp-1',
        group_name: 'Lavoro',
        permission: 'edit',
        shared_with_email: 'colleague@example.com',
        shared_with_id: 'user-456',
        created_at: new Date().toISOString()
      }
    ],
    receivedShares: []
  }

  offlineStorage.setShares(fakeShares as any)
  assert.deepEqual(offlineStorage.getShares(), fakeShares)

  offlineStorage.clearShares()
  assert.deepEqual(offlineStorage.getShares(), { myShares: [], receivedShares: [] })
})

test('offlineStorage manages mutation queue and cancellations', () => {
  offlineStorage.clearMutations()
  assert.deepEqual(offlineStorage.getMutations(), [])

  const mutation1 = {
    id: 'mut-1',
    type: 'todo:insert' as const,
    tempId: -100,
    payload: { title: 'Offline Task' },
    createdAt: Date.now()
  }

  const mutation2 = {
    id: 'mut-2',
    type: 'todo:update' as const,
    targetId: -100,
    payload: { completed: true },
    createdAt: Date.now() + 10
  }

  offlineStorage.addMutation(mutation1)
  offlineStorage.addMutation(mutation2)

  const current = offlineStorage.getMutations()
  assert.equal(current.length, 2)
  assert.equal(current[0].id, 'mut-1')
  assert.equal(current[1].id, 'mut-2')

  offlineStorage.removeMutation('mut-1')
  const afterRemove = offlineStorage.getMutations()
  assert.equal(afterRemove.length, 1)
  assert.equal(afterRemove[0].id, 'mut-2')

  offlineStorage.clearMutations()
  assert.deepEqual(offlineStorage.getMutations(), [])
})

test('temp ID resolution simulates successful sync replay', () => {
  const idMap = new Map<number | string, number | string>()
  const tempId = -1700000000000
  const realServerId = 42

  // Simulate todo:insert execution
  idMap.set(tempId, realServerId)

  // Subsequent update pointing to tempId
  const updateMutation = {
    type: 'todo:update',
    targetId: tempId,
    payload: { completed: true }
  }

  const resolvedTargetId = idMap.get(updateMutation.targetId) ?? updateMutation.targetId
  assert.equal(resolvedTargetId, realServerId)
})

test('isNetworkError correctly identifies offline and network failures', () => {
  fakeNavigator.onLine = false
  assert.equal(isNetworkError(new Error('something')), true)

  fakeNavigator.onLine = true
  assert.equal(isNetworkError(new TypeError('Failed to fetch')), true)
  assert.equal(isNetworkError(new Error('NetworkError when attempting to fetch resource.')), true)
  assert.equal(isNetworkError(new Error('Network request failed')), true)
  assert.equal(isNetworkError(new Error('ERR_INTERNET_DISCONNECTED')), true)
  assert.equal(isNetworkError(new Error('fetch failed')), true)

  // Standard non-network errors
  assert.equal(isNetworkError(new Error('Invalid password')), false)
  assert.equal(isNetworkError(new Error('Row not found')), false)
})
