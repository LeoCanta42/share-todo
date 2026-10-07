/**
 * Password helpers shared by the sign-up form and the admin panel.
 *
 * Same minimum the app has always used on the sign-up screen (and the same one
 * `admin_set_password` enforces server-side): keeping them equal means the client
 * never offers a password the database will reject.
 */
export const MIN_PASSWORD_LENGTH = 8

interface CharClass {
  chars: string
  /** How many characters this class contributes to the generated password. */
  count: number
}

const CLASSES: CharClass[] = [
  { chars: 'abcdefghijkmnopqrstuvwxyz', count: 5 },
  { chars: 'ABCDEFGHJKLMNPQRSTUVWXYZ', count: 4 },
  { chars: '23456789', count: 3 },
  { chars: '!@#$%^&*-_=+', count: 2 }
]

/**
 * A random password for the "reset password" action.
 *
 * Uses `crypto.getRandomValues` — not `Math.random` — because the result is handed
 * to a real person as their new credential. The alphabet leaves out the characters
 * that are misread when a password is dictated or copied by hand (l/1, O/0).
 */
export function generatePassword(length = 16): string {
  const pools = CLASSES.map(c => c.chars)
  const all = pools.join('')
  const chars: string[] = []

  // `charAt` rather than `[]` because `noUncheckedIndexedAccess` types an indexed
  // read as possibly-undefined, which `push` would then reject.
  CLASSES.forEach((klass) => {
    for (let i = 0; i < klass.count; i++) {
      chars.push(klass.chars.charAt(randomIndex(klass.chars.length)))
    }
  })

  while (chars.length < length) {
    chars.push(all.charAt(randomIndex(all.length)))
  }

  const minimum = CLASSES.reduce((n, c) => n + c.count, 0)
  return shuffle(chars.slice(0, Math.max(length, minimum))).join('')
}

function randomIndex(max: number): number {
  if (import.meta.client && globalThis.crypto?.getRandomValues) {
    const buffer = new Uint32Array(1)
    globalThis.crypto.getRandomValues(buffer)
    return buffer[0]! % max
  }
  return Math.floor(Math.random() * max)
}

function shuffle(values: string[]): string[] {
  for (let i = values.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1)
    const a = values[i]!
    values[i] = values[j]!
    values[j] = a
  }
  return values
}
