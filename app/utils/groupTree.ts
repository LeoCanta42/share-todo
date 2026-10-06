import type { Group, GroupNode } from '~/types/group'

/**
 * The nesting limit.
 *
 * Depth is not a performance question: `path` is maintained by the database and an
 * ancestor check is an array comparison, so ten levels cost what two cost. The cap
 * exists because a phone has to render it — a chip in a row, an indented picker and a
 * /g/Lavoro/Clienti/2026 link all stop working much past this. Raising it is a code
 * change (the database only enforces the shape of a path, not its length).
 */
export const MAX_GROUP_DEPTH = 3

/** Compare two group names the way a person reads them. */
function byName(a: Group, b: Group): number {
  return a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
}

/**
 * Groups into a tree. Children are looked up by `parent_id`, but a group whose parent
 * is not in the list becomes a root: a share can hand you a sub-group without its
 * ancestors, and the tree still has to show what you were given.
 */
export function buildGroupTree(groups: Group[]): GroupNode[] {
  const nodes = groups.map(group => ({ group, children: [] as GroupNode[], depth: group.depth }))
  const byId = new Map(nodes.map(node => [node.group.id, node]))

  const roots: GroupNode[] = []
  for (const node of nodes) {
    const parent = node.group.parent_id ? byId.get(node.group.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sort = (list: GroupNode[]) => {
    list.sort((a, b) => byName(a.group, b.group))
    list.forEach(node => sort(node.children))
  }
  sort(roots)

  return roots
}

/** Depth-first, parents before their children: what a picker renders. */
export function flattenGroupTree(nodes: GroupNode[]): GroupNode[] {
  const flat: GroupNode[] = []
  const walk = (list: GroupNode[]) => {
    for (const node of list) {
      flat.push(node)
      walk(node.children)
    }
  }
  walk(nodes)
  return flat
}

/**
 * "Lavoro/Clienti" — the name path a group page is addressed by.
 *
 * Walks `parent_id` rather than `path`, because `path` holds ids: the URL is meant to
 * be readable, and the database guarantees a name is unique among its siblings, which
 * is what makes the path unambiguous.
 */
export function groupNamePath(groups: Group[], id: string): string[] {
  const byId = new Map(groups.map(group => [group.id, group]))
  const names: string[] = []
  let current = byId.get(id)

  while (current) {
    names.unshift(current.name)
    current = current.parent_id ? byId.get(current.parent_id) : undefined
    // A broken chain (a parent outside our visible tree) cannot loop forever.
    if (names.length > MAX_GROUP_DEPTH + 4) break
  }

  return names
}

/**
 * The group a name path points at: /g/Lavoro/Clienti is resolved by walking names
 * from the root, which is why a name only has to be unique among its siblings.
 */
export function resolveGroupPath(groups: Group[], names: string[]): Group | null {
  const wanted = names.map(name => name.trim()).filter(Boolean)
  if (wanted.length === 0) return null

  let parentId: string | null = null
  let found: Group | null = null

  for (const name of wanted) {
    const match = groups.find(group =>
      (group.parent_id ?? null) === parentId
      && group.name.toLowerCase() === name.toLowerCase()
    )
    if (!match) return null
    found = match
    parentId = match.id
  }

  return found
}

/** True when `groupId` is `ancestorId` itself or sits underneath it. */
export function isSameOrDescendant(group: Group | undefined | null, ancestorId: string): boolean {
  if (!group) return false
  return group.path.includes(ancestorId)
}

/** How many levels a new child of `parentId` would sit at (1 = top level). */
export function depthUnder(groups: Group[], parentId?: string | null): number {
  if (!parentId) return 1
  const parent = groups.find(group => group.id === parentId)
  return (parent?.depth ?? 0) + 1
}

/** Whether a new sub-group may be created under `parentId`. */
export function canNestUnder(groups: Group[], parentId?: string | null): boolean {
  return depthUnder(groups, parentId) <= MAX_GROUP_DEPTH
}
