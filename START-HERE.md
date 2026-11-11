# Our Room — start here

## Run it

```bash
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173).

If `npm run dev` complains about esbuild:

```bash
npm approve-scripts esbuild
npm install
```

## Before the first sign-in — do this once

Sign-in uses **email + password**. Magic links were removed: Supabase's free
mailer allows only ~2 emails an hour, and Gmail's link scanner spends the
single-use token before you can click it.

In the Supabase dashboard → **Authentication → Users**:

1. Delete any existing users (earlier attempts left half-made accounts).
2. **Add user → Create new user**, twice:

   | Field | Value |
   |---|---|
   | Email | `andreiventura04@gmail.com` |
   | Password | one you'll both remember |
   | **Auto Confirm User** | **tick it** — or it emails a confirmation and you hit the rate limit again |

   Then the same for `cherrylroana07@gmail.com`.

Those two addresses must match `allowed_emails` in the database exactly. They're
what Row Level Security checks — an account not on that list can sign in but
cannot read or write a single row.

## If the sign-in or the allow-list misbehaves

Run this in Supabase → SQL Editor. It repairs the allow-list read policy and
grants the check function, which together caused a false
"isn't on the allowed list" warning:

```sql
drop policy if exists "read allowlist" on allowed_emails;
create policy "read allowlist" on allowed_emails
  for select to authenticated using (true);

grant execute on function is_allowed() to authenticated, anon;

select * from allowed_emails;
```

To set a password to a known value without touching the dashboard:

```sql
create extension if not exists pgcrypto with schema extensions;

update auth.users
set encrypted_password = extensions.crypt('YOUR-PASSWORD', extensions.gen_salt('bf'))
where email in ('andreiventura04@gmail.com', 'cherrylroana07@gmail.com');
```

Verify it took:

```sql
select email,
       encrypted_password = extensions.crypt('YOUR-PASSWORD', encrypted_password) as ok
from auth.users;
```

## New in the room — do this once: migration 002

The bottle, the frames, the TV, the music, the two computers and the time
capsule need one database update.

1. Supabase → **SQL Editor** → **New query**
2. Paste the whole of `supabase-migration-002.sql` and press **Run**
3. The last result shows two rows:

   | email | who |
   |---|---|
   | andreiventura04@gmail.com | andrei |
   | cherrylroana07@gmail.com | cherryl |

   If a `who` is empty, that email in `allowed_emails` is spelled differently —
   fix it there and run the file again (it's safe to run twice).

Until it's run, the room still works; the new things show a message asking for it.

### What's where

| In the room | What it does |
|---|---|
| **Slippers by the door** | each pair shows only while its owner has the site open — hers are pink |
| **The bottle** (coffee table) | leave each other notes; it glows with a rolled letter inside when one is waiting for you |
| **The four frames** | click one to hang your own photo (upload, or pick from either computer) |
| **The TV** | in the room it plays a slideshow of your photos, or one of your videos, on the actual screen. Click it to sit down with sound, switch channels, add videos (≤ 50 MB) or YouTube links |
| **The speakers** | our songs: upload songs (they play in full and the speakers move to the bass) or paste Spotify links |
| **Left desk / right desk** | Che's computer / Andrei's — see "The two computers" below |
| **The little box on the corner cabinet** | the time capsule — see below |
| **The clock** | day and night follow Manila time on their own (6am / 6pm). Click the clock or the badge to switch by hand; it follows the clock again at the next 6 o'clock |

### The two computers

Each desk is a working PC (you're both admins, so either of you can change
anything on both):

- **Start up / lock screen / sign in**, like Windows. The monitors in the room
  show each PC's lock screen with the time.
- **Back to room** (taskbar, or Esc) leaves everything open. The monitor in the
  room shows exactly what was on screen, and clicking the desk picks up where
  you left off. **Start → power → Shut down** closes everything and turns the
  screen off; the next visit boots it up again.
- **Desktop**: drag icons around, drag a .txt onto a folder to move it, onto
  the Recycle Bin to delete it, right-click for New folder / Text document.
- **File Explorer**: Desktop, Documents, Pictures (your folders), Music,
  **This PC** (how much of your real storage is used) and the **Recycle Bin**
  (restore, delete for good; items older than 30 days empty themselves).
  Drop photos or .txt files from your real computer into a folder.
- **Notepad**, **Command Prompt** (`help` lists the commands — dir, cd, type,
  echo > file, mkdir, ren, move, del, find, tree, ping che, love …),
  **Browser** (searches open in a real tab; YouTube and Spotify links play
  inside), **Photos**, **Settings** (wallpaper: built-in ones, any of your
  photos, or a picture from your real computer).

The Recycle Bin, text files inside folders and wallpaper sync need
`supabase-migration-004.sql` (below). The room monitors' "what's on screen"
picture needs one package: `npm install html2canvas@1.4.1`.

### The time capsule

Write a letter, pick the day it opens (a year, your next anniversary, 5 or 10
years, or any day), seal it. After that **nobody can open, change or delete it
until that day** — not either of you. This is enforced by the database itself:

- the letter's contents sit in a table no query is allowed to read
- the only way in is `open_capsule()`, which checks the database's own clock,
  so changing the date on your computer does nothing
- a letter to one of you is theirs to open first

Honest note: whoever owns the Supabase project can technically look inside the
tables from the dashboard. That's the one door left, and it's on the honour system.

### Spotify, honestly

Websites can't play Spotify any way except Spotify's own embedded player. Logged
in to Spotify in that browser → full songs. Not logged in → 30-second previews.
Uploaded songs always play in full.

### Storage

Supabase's free plan has 1 GB of file storage, shared by photos, videos and
songs. A one-minute phone video can be 50–100 MB, so keep videos short (trim
them on your phone first).

## Do this once: migration 004 (the computers)

1. Supabase → **SQL Editor** → **New query**
2. Paste the whole of `supabase-migration-004.sql` and press **Run**
3. The last result lists five rows: `letters | deleted_at`, `letters | folder_id`,
   `pc_folders | deleted_at`, `pc_photos | deleted_at`, `pc_settings | wallpaper`

Safe to run twice. Until it's run, the computers work but deleting is permanent
and wallpapers only change on the computer you're on.

## Do this once: migration 005 (one room for both of you)

1. Supabase → **SQL Editor** → **New query**
2. Paste the whole of `supabase-migration-005.sql` and press **Run**
3. The last result lists three rows: `achievements`, `push_subscriptions`, `room_state`

Safe to run twice. After this the lights, a hand-set day/night and the TV are
the same on both screens, and achievements are saved for both of you.

## Notifications ("she left you something") — do this once

Notes in the bottle, letters on the computers and sealed time capsules send a
notification to the other one's phone, even with the room closed.

**1. Make the keys** (VS Code terminal, in `C:\Users\andre\Downloads\our-room`):

```
node tools/push-keys.mjs
```

It prints three things. Keep that window open.

**2. `.env`:** add the `VITE_VAPID_PUBLIC_KEY=…` line it printed to the end of
`C:\Users\andre\Downloads\our-room\.env`, then restart `npm run dev`.

**3. The function that sends them:** Supabase → **Edge Functions** →
**Deploy a new function** → **Via Editor**

- Function name: `notify`
- Delete the sample code, paste all of `supabase\functions\notify\index.ts`
- **Deploy function**

**4. Its secrets:** Supabase → **Edge Functions** → **Secrets** (page: https://supabase.com/dashboard/project/gcatxxuworexeeuhgcda/functions/secrets) → add the three
it printed: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
(The private key goes only here — never in `.env`, never in the code.)

**5. Turn them on, on each phone:** in the room, ⚙ (top left) → Notifications →
**Turn on**. iPhone: first Safari → Share → **Add to Home Screen**, open the
room from the home screen, then turn them on (Apple only allows it that way).

They're skipped when you're both in the room — you'll see it happen live.

## On a phone

- Everything fits any screen: the room frames itself, panels slide up from
  the bottom, the scrapbook shows one page at a time (swipe or the arrows),
  the computers open every window full screen, tap opens, press-and-hold is
  right-click.
- **Install it:** Android/Chrome/Brave: ⚙ → Install (or the browser menu →
  Install app). iPhone: Safari → Share → Add to Home Screen. It opens full
  screen with its own icon.

## Check the setup any time

```bash
npm run doctor   # connection + every table, from the terminal
npm run check    # index.html structure and screen backgrounds
```

## If something looks wrong

- **Red bar across the top of the room** — your edits are NOT reaching the
  database. It says why. Nothing you make will survive a reload until it's gone.
- **Red panel bottom-left** — something threw. It shows the real message,
  including Supabase's error codes.

## About the 3D book

The cover is a real six-sided box: two boards, a spine with raised bands and
gold headbands, and a page block you can see the fore edge, head and tail of.
Drag it to turn it, and the first page is under the front board when it swings
open.

The material is painted on a `.bk-skin` layer inside each face rather than on
the face itself. That looks like a detail but it isn't: Chromium lets a
background-image on a 3D-transformed element go stale while the transform keeps
changing, so the board used to tear into blocks of bare paper *while you were
dragging it*. A background on an ordinary child re-draws correctly. If you ever
move that background back onto `.bk-front`, `.bk-spine` or `.bk-back`, the
tearing comes back.

## The flow

Enter → passcode `06122026` → email + password → pick who you are → the room.

The passcode is decoration; it sits in the JavaScript where anyone could read
it. The password and the database policies are the real locks.

Picking "Andrei" or "Cherryl" only sets the greeting. Your identity is the email
you signed in with.

## What's where

```
our-room/
├── index.html            all screens
├── .env                  your Supabase URL + key
├── supabase-schema.sql   the database (already run)
├── src/
│   ├── main.js           entry flow, sign-in
│   ├── db.js             all Supabase calls
│   ├── store.js          cache + which backend is live
│   ├── scene.js          the 3D room
│   ├── bookshelf-ui.js   the shelf
│   ├── cover-ui.js       the 3D book cover
│   ├── editor.js         the scrapbook
│   ├── desktop-ui.js     the in-room PC
│   └── style.css
├── tools/                doctor + structure check
└── public/models/room.glb
```

Full detail in `README.md`; database setup in `SUPABASE-SETUP.md`.