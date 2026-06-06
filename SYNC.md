# Cross-device sync (Supabase)

Countdown Deck can sync your countdowns across the desktop app and the iPhone PWA using a free [Supabase](https://supabase.com) project and an email/password login. Your countdowns are stored as a single JSON record per account; the most recent change from any device wins (last-write-wins).

You only set this up once. The app ships **no** keys — you paste your own project's URL + anon key into each device, so nothing sensitive lives in the public repo.

## 1. Create a free Supabase project
1. Sign up at [supabase.com](https://supabase.com) and create a new project (any name; pick a region near you). Wait ~2 minutes for it to provision.
2. In the project: **Settings → API**. Copy:
   - **Project URL** (e.g. `https://abcdefgh.supabase.co`)
   - **anon public** key (a long `eyJ…` string). *(The anon key is meant to be public; row-level security below keeps each account's data private.)*

## 2. Create the table + security policy
Open **SQL Editor → New query**, paste this, and **Run**:

```sql
create table if not exists public.decks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
alter table public.decks enable row level security;
create policy "own deck" on public.decks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

This stores one row per user and ensures **users can only read/write their own row**.

## 3. (Recommended) Make sign-up instant
By default Supabase emails a confirmation link on sign-up. For a smoother first run go to **Authentication → Providers → Email** and turn **Confirm email** off — then sign-up logs you straight in. (If you leave it on, just click the link in the email once, then Log in.)

## 4. Connect each device
In the **desktop app**: Settings (⚙) → **Account & cloud sync**. In the **iPhone PWA**: tap the ☁ button in the top bar.

On each device:
1. Paste the **Supabase URL** and **anon key**.
2. Enter your email + a password → **Sign up** (first device) or **Log in** (other devices).
3. That's it — countdowns push automatically on change and pull on launch, on window focus, and every 60 seconds. Use **Sync now** to pull immediately.

## How syncing behaves
- **Last-write-wins** on the whole list: the most recent save from any device becomes the shared version. If you edit two devices while both are offline, the one that reconnects/saves last wins — fine for personal use, but not a true merge.
- Everything still works **offline**; changes sync when you're back online and the app is open.
- **Log out** clears the local session (your countdowns stay on the device and in the cloud).

## Cost
Supabase's free tier (database + auth) is far more than a personal countdown list needs. There's no cost unless you dramatically exceed the free limits.
