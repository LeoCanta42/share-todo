import type { Database } from './database.types'

export type Todo = Database['public']['Tables']['todos']['Row']
export type TodoInsert = Database['public']['Tables']['todos']['Insert']
export type TodoUpdate = Database['public']['Tables']['todos']['Update']

export type TodoFilter = 'all' | 'active' | 'completed'

export interface TodoStats {
  total: number
  active: number
  completed: number
  percentage: number
}
