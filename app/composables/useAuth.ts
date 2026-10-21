import type { Database } from '~/types/database.types'
import { MIN_PASSWORD_LENGTH } from '~/utils/password'

export function useAuth() {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  const { userEmail } = useCurrentUser()
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
        password
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
          title: 'Registrazione completata',
          description: 'Il tuo account è in attesa di conferma da parte dell\'amministratore.',
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

  /**
   * Change the signed-in user's own password.
   *
   * `auth.updateUser()` does not ask for the current password, so on its own it
   * would let anyone with a borrowed session lock the owner out. The current
   * password is therefore verified first by re-authenticating: same credentials,
   * and it fails loudly instead of silently rewriting the password.
   */
  async function changePassword(currentPassword: string, newPassword: string): Promise<boolean> {
    const email = userEmail.value
    if (!email) {
      toast.add({
        title: 'Sessione non valida',
        description: 'Accedi di nuovo per cambiare la password.',
        color: 'error'
      })
      return false
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      toast.add({
        title: 'Password troppo corta',
        description: `Usa almeno ${MIN_PASSWORD_LENGTH} caratteri.`,
        color: 'warning'
      })
      return false
    }

    if (currentPassword === newPassword) {
      toast.add({
        title: 'Nessuna modifica',
        description: 'La nuova password è identica a quella attuale.',
        color: 'info'
      })
      return false
    }

    loading.value = true
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword
      })

      if (authError) {
        toast.add({
          title: 'Password attuale non corretta',
          description: 'Controlla la password inserita e riprova.',
          color: 'error'
        })
        return false
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword })

      if (error) {
        toast.add({
          title: 'Errore aggiornamento password',
          description: error.message,
          color: 'error'
        })
        return false
      }

      toast.add({
        title: 'Password aggiornata',
        description: 'Usa la nuova password al prossimo accesso.',
        color: 'success'
      })
      return true
    } catch (err: unknown) {
      console.error('Change password error:', err)
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
    changePassword,
    logout
  }
}

