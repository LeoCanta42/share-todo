import type { Database } from '~/types/database.types'

export function useAuth() {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  const toast = useToast()

  const loading = ref(false)

  async function loginWithEmail(email: string, password: string): Promise<boolean> {
    loading.value = true
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      })

      if (error) {
        toast.add({
          title: 'Errore di accesso',
          description: error.message,
          color: 'error'
        })
        return false
      }

      toast.add({
        title: 'Accesso effettuato',
        description: 'Bentornato!',
        color: 'success'
      })
      return true
    } catch (err: unknown) {
      console.error('Email login error:', err)
      return false
    } finally {
      loading.value = false
    }
  }

  async function signUpWithEmail(email: string, password: string): Promise<boolean> {
    loading.value = true
    try {
      const { error, data } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
        }
      })

      if (error) {
        toast.add({
          title: 'Errore di registrazione',
          description: error.message,
          color: 'error'
        })
        return false
      }

      if (data.session) {
        toast.add({
          title: 'Account creato!',
          description: 'Accesso effettuato con successo.',
          color: 'success'
        })
      } else {
        toast.add({
          title: 'Registrazione quasi completata',
          description: 'Controlla la tua email per confermare l\'account.',
          color: 'info'
        })
      }
      return true
    } catch (err: unknown) {
      console.error('Sign up error:', err)
      return false
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    loading.value = true
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        toast.add({
          title: 'Errore durante il logout',
          description: error.message,
          color: 'error'
        })
      } else {
        toast.add({
          title: 'Disconnesso',
          description: 'A presto!',
          color: 'neutral'
        })
      }
    } finally {
      loading.value = false
    }
  }

  return {
    user,
    loading,
    loginWithEmail,
    signUpWithEmail,
    logout
  }
}

