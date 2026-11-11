# Connecting the database

Roughly fifteen minutes, once.

## 1. Run the schema

Supabase dashboard → **SQL Editor** → New query → paste all of `supabase-schema.sql` → **Run**.

Before you run it, change these two lines near the top to your real emails:

```sql
insert into allowed_emails (email) values
  ('andrei@example.com'),      -- <<< yours
  ('cherryl@example.com')      -- <<< hers
```

Those two addresses are the only ones that can read or write anything. Row Level Security enforces it at the database, not in the browser — so unlike the passcode, this is real.

## 2. Your keys are already in

`.env` is in the zip, filled in with your project:

```
VITE_SUPABASE_URL=https://gcatxxuworexeeuhgcda.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_611fuZ7Sr-gRiQ8s-W8j3Q_XMUgtfwX
```

**On the variable names:** the dashboard shows `NEXT_PUBLIC_…` because its snippet assumes Next.js. This project is Vite, which only exposes variables starting with `VITE_`. The code accepts either spelling, but `VITE_` is the correct one here.

**On the key being public:** a publishable/anon key is designed to sit in browser code. It identifies the project and grants nothing by itself — the Row Level Security policies are what restrict access. So sharing it isn't a leak. The one you must never put in the browser or share is the **service_role** key, which bypasses RLS entirely.

## 3. Allow the magic-link redirect

Supabase → **Authentication → URL Configuration** → add your dev URL to **Redirect URLs**:

```
http://localhost:5173
```

Add your real domain too when you deploy.

## Check it worked

```bash
npm run doctor
```

That talks to your project from the terminal and tells you exactly which part is wrong — missing tables, a rejected key, an unreachable URL. Run it before opening the browser; it's faster than reading an error panel.

If it says **"the database is empty — the schema has not been run"**, that's step 1 above.

## 4. Run it

The sign-in screen shows a small line under the button telling you whether it reached your project. The browser console also prints, in colour, whether it's connected to Supabase or running local-only — so you'll never be syncing-in-name-only without knowing.


```bash
npm install
npm run dev
```

The flow is now: gate → passcode → **email sign-in** → who's entering → the room. You'll get a link by email; clicking it drops you straight in. The session persists, so day to day you won't sign in again.

## What changed

- **Both of you see the same thing.** Books, pages, photos, covers — one shared set, on any device.
- **Photos are real files**, uploaded to a private storage bucket, not base64 crammed into a 5MB text budget. The old ceiling is gone.
- **It's backed up.** Clearing your browser no longer destroys anything.
- **Signing out is real.** Leaving through the door flushes any unsaved edits, then signs you out.

## When something breaks

- `npm run doctor` — checks the connection and every table from the terminal.
- The sign-in screen shows the same check, with the specific fix underneath.
- The red error panel now prints real Supabase messages. It used to show `[object Object]`, because Supabase returns errors as plain objects rather than `Error`s and the panel only knew how to read the latter.

## If you skip this

Without `.env` the app runs exactly as before — everything in localStorage, on that one device. The "continue without syncing" button on the sign-in screen does the same thing deliberately. Useful for trying things out; not what you want long-term.

## Moving what you already made

Anything you built before this lives in your browser's localStorage and won't appear once Supabase is on — the two stores are separate. If you want to keep those pages, tell me and I'll write a one-time importer that reads the old local data and pushes it up.

## Notes

- **Saves are batched.** Edits queue and flush about half a second after you stop, so dragging a photo doesn't fire a request per pixel. Closing the tab flushes whatever's pending.
- **Photo URLs are signed and expire hourly.** The bucket is private; the app fetches a fresh URL when it needs to show an image.
- **New pages get a temporary id** until the insert comes back, then swap to the real one. That's why a page is editable instantly rather than after a round trip.
- **If a save fails**, the red error panel says so rather than failing quietly.
