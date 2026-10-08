# ShareToDo 📝 ✅ 🗂️

**ShareToDo** è una moderna Single Page Application e Progressive Web App (PWA) costruita con **Nuxt 4**, **Vue 3**, **Nuxt UI (Tailwind CSS)** e **Supabase**. Permette di gestire attività personali e collaborative, prendere appunti, organizzare tutto in una struttura gerarchica ad albero di gruppi e condividere liste o singoli sottogruppi con colleghi o familiari con permessi granulari e sicurezza a livello di database (Row Level Security).

---

## ✨ Funzionalità Principali

### 🎯 1. Gestione Attività & Note Intelligente
- **Attività & Scadenze**: crea to-do con data e ora di scadenza (`due_at`), supporto per eventi "Tutto il Giorno" (`due_all_day`), promemoria e fuso orario.
- **Struttura Gerarchica a Gruppi**: organizza task e note in percorsi nidificati (es. `Lavoro/Progetti/App`, `Casa/Spesa`) con navigazione dedicata (`/g/...group`) e filtri contestuali.
- **Note Integrate**: blocco note rapido e sincronizzato per gruppo, con ricerca, note in evidenza e collegamenti contestuali.
- **Filtri & Ordinamenti**: visualizza rapidamente *Tutti*, *Attivi*, *Completati*, o filtra per scadenze (*Oggi*, *In scadenza*, *In ritardo*).
- **Quick Add & FAB**: inserimento fulmineo di to-do e note tramite tasto rapido o Floating Action Button (FAB).

### 👥 2. Condivisione Granulare & Collaborazione
- **Condivisione Scoped per Gruppo**: condividi l'intero spazio di lavoro (`Generale` o tutti i gruppi) oppure limita la condivisione a uno specifico sottogruppo.
- **Livelli di Permesso**: controllo degli accessi granulare (sola lettura o modifica completa).
- **Gestione Inviti & Condivisioni**: modale dedicata per aggiungere collaboratori via email, revocare accessi o modificare privilegi.
- **Sicurezza Database RLS**: protezione nativa PostgreSQL Row Level Security per garantire che ogni utente veda solo i propri dati o quelli esplicitamente condivisi.

### 🛡️ 3. Controllo Accessi & Pannello Admin
- **Flusso di Approvazione Utenti**: i nuovi utenti registrati entrano nello stato *In attesa di approvazione* (*pending*); l'accesso ai dati è bloccato finché un amministratore non approva l'account.
- **Pannello Amministrazione (`/admin`)**: interfaccia riservata agli amministratori per visualizzare gli utenti, approvare o rifiutare le registrazioni, revocare accessi, generare password temporanee e assegnare privilegi.
- **Funzioni RPC `SECURITY DEFINER`**: operazioni amministrative sicure gestite direttamente a livello di database.

### 📱 4. Esperienza Mobile & PWA Avanzata
- **Installabile come App Nativa**: supporto PWA completo (`@vite-pwa/nuxt`) su iOS, Android, macOS e Windows.
- **Web Share Target API (`/share`)**: ricevi link o testi condivisi direttamente dal menu di condivisione di sistema dello smartphone per creare al volo note o to-do.
- **Badge Icona Dinamico**: l'icona dell'app mostra il conteggio in tempo reale delle attività rimanenti da completare.
- **Haptic Feedback**: vibrazioni tattili reattive su azioni chiave nei dispositivi supportati.
- **Apple Splash Screens**: schermate di avvio ottimizzate per tutti i modelli di iPhone e iPad per evitare flash bianchi all'apertura.

### 🎨 5. Personalizzazione & Design
- **Nuxt 4 + Nuxt UI (Tailwind CSS)**: interfaccia moderna, reattiva, fluida e accessibile.
- **Palette Temi Multi-Accento**: selezione del colore principale dell'app (Indaco, Smeraldo, Viola, Rosa, Ambra, Ciano, Teal, Sky, Blu).
- **Modalità Scura / Chiara / Sistema**: transizioni morbide e sincronizzazione automatica con il tema del sistema operativo e la barra del browser.
- **Densità & Dimensione Testo**: preferenze personalizzabili per la densità dell'interfaccia e la grandezza dei caratteri.

---

## 🏗️ Architettura & Stack Tecnologico

- **Framework**: **Nuxt 4** (`nuxt: ^4.6.0`, Vue 3, Vue Router)
- **Backend & Database**: **Supabase** (`@nuxtjs/supabase`) per Authentication, Database PostgreSQL e Row Level Security (RLS)
- **Design System & Icone**: **Nuxt UI** (`@nuxt/ui`) + **Lucide Icons** (`@iconify-json/lucide`)
- **PWA & Offline**: **Vite PWA for Nuxt** (`@vite-pwa/nuxt`)

### Struttura delle Cartelle

```
share-todo/
├── app/
│   ├── assets/css/main.css         # Stili globali, Tailwind CSS, temi e scale accento
│   ├── components/                 # Componenti UI (TodoList, QuickAdd, ShareModal, GroupsGrid, NoteComposer, ecc.)
│   ├── composables/                # useTodos, useNotes, useGroups, useShares, useProfile, useAdmin, useAppearance, usePwa, ecc.
│   ├── middleware/                 # admin.ts, share-target.global.ts
│   ├── pages/
│   │   ├── index.vue               # Dashboard principale con to-do, gruppi e statistiche
│   │   ├── notes.vue               # Pannello dedicato per la gestione note
│   │   ├── share.vue               # Ricevitore Web Share Target
│   │   ├── admin.vue               # Pannello di gestione utenti e approvazioni
│   │   └── g/
│   │       └── [...group].vue      # Vista filtrata per gruppo/sottogruppo gerarchico
│   ├── plugins/                    # preferences.ts
│   ├── types/                      # Definizioni TypeScript (todo, note, group, profile, database.types)
│   ├── utils/                      # Gestione date, gerarchia gruppi (groupTree), haptics, splash Apple, password
│   ├── app.vue                     # App Shell principale, navigazione, badge e dialoghi globali
│   └── app.config.ts               # Configurazione Nuxt UI
├── supabase/
│   └── schema.sql                  # Schema SQL completo, tabelle, indici, trigger, RPC e policy RLS
├── public/                         # Icone PWA, splash screens Apple, manifest e favicon
├── database.types.ts               # Tipi TypeScript generati per Supabase
├── nuxt.config.ts                  # Configurazione Nuxt (PWA, Supabase, Moduli, Header)
└── package.json
```

---

## 🚀 Configurazione & Avvio

### 1. Configurazione Database Supabase
Esegui lo script SQL [supabase/schema.sql](file:///home/leo/Desktop/Projects/share-todo/supabase/schema.sql) nel **SQL Editor** della tua dashboard Supabase.

Lo script è **completamente idempotente** e configura:
- Tabelle `todos`, `notes`, `todo_shares`, `profiles`.
- Flusso di registrazione con stato `approved = false` e permessi condizionati.
- Policy RLS per isolamento dati e condivisioni scoped per gruppo.
- Funzioni RPC per l'amministrazione utenti (`admin_list_users`, `admin_set_approved`, `admin_reset_password`, `admin_delete_user`).

#### Assegnare i permessi di Amministratore al proprio utente
Dopo esserti registrato con la tua email nell'app, esegui questa query nel SQL Editor di Supabase:

```sql
UPDATE public.profiles
SET is_admin = true, approved = true
WHERE lower(email) = lower('tua-email@example.com');
```

---

### 2. File di configurazione ambiente `.env`
Crea o modifica il file `.env` nella root del progetto inserendo le credenziali del tuo progetto Supabase:

```env
NUXT_PUBLIC_SUPABASE_URL=https://tuo-progetto.supabase.co
NUXT_PUBLIC_SUPABASE_KEY=tua-chiave-anon-public
```

---

### 3. Installazione e Avvio

```bash
# Installa le dipendenze
npm install

# Avvia il server di sviluppo
npm run dev
```

L'applicazione sarà attiva su `http://localhost:3000`.

---

### 4. Build di Produzione

```bash
# Compilazione per la produzione
npm run build

# Anteprima locale della build
npm run preview
```
