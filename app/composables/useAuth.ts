import type { Database } from '~/types/database.types'
import type { JwtPayload } from '@supabase/supabase-js'
import { MIN_PASSWORD_LENGTH } from '~/utils/password'
import { offlineStorage } from '~/utils/offlineStorage'

export function useAuth() {
  const supabase = useNuxtApp().$supabase?.client as ReturnType<typeof useSupabaseClient<Database>> | undefined
    ?? useSupabaseClient<Database>()
  const { user, userEmail, rawUser } = useCurrentUser()
  const toast = useToast()

  const loading = ref(false)

  async function loginWithEmail(email: string, password: string): Promise<boolean> {
    loading.value = true
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
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

      offlineStorage.setLoggedOut(false)
      if (data.user) {
        const payload: JwtPayload = {
          sub: data.user.id,
          email: data.user.email,
          aud: data.user.aud,
          role: data.user.role
        }
        offlineStorage.setUser(payload)
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

      if (data.session && data.user) {
        offlineStorage.setLoggedOut(false)
        const payload: JwtPayload = {
          sub: data.user.id,
          email: data.user.email,
          aud: data.user.aud,
          role: data.user.role
        }
        offlineStorage.setUser(payload)

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
      offlineStorage.clearAll()
      rawUser.value = null
      const offlineUserState = useState<JwtPayload | null>('offline-user-state', () => null)
      offlineUserState.value = null

      const { error } = await supabase.auth.signOut()
      if (error) {
        console.warn('SignOut warning:', error)
      }

      toast.add({
        title: 'Disconnesso',
        description: 'A presto!',
        color: 'neutral'
      })
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
