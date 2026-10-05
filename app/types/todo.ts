import type { Database } from './database.types'

export type Todo = Database['public']['Tables']['todos']['Row']
export type TodoInsert = Database['public']['Tables']['todos']['Insert']
export type TodoUpdate = Database['public']['Tables']['todos']['Update']

export type TodoShare = Database['public']['Tables']['todo_shares']['Row']
export type TodoShareInsert = Database['public']['Tables']['todo_shares']['Insert']
export type TodoShareUpdate = Database['public']['Tables']['todo_shares']['Update']

export type TodoPermission = TodoShare['permission']

export type TodoFilter = 'all' | 'active' | 'completed'
export type TodoScope = 'all' | 'mine' | 'shared'

export interface TodoStats {
  total: number
  active: number
  completed: number
  percentage: number
}
