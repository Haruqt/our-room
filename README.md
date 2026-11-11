# Our Room

A private 3D room. Gate → passcode → pick who's entering → explore the room.

## Running it

Needs [Node.js](https://nodejs.org) 18+.

```bash
npm install
npm run dev
```

Open the address it prints (usually `http://localhost:5173`).

Build a deployable version: `npm run build` → outputs `dist/`.

## What's in it

### Entry flow
- Gate screen, then an 8-digit passcode (`06122026`), then Andrei / Cherryl.
- The passcode now handles paste (paste the whole code into any box), arrow keys, backspace across boxes, and Enter. It only validates once all eight are filled.
- Once you pick a name it's remembered on that device. To leave, **click the door** — it asks to confirm, fades out, and re-locks. (The old lock button is gone.)

### The room
The room is the low-poly apartment: two tall bookshelves on the left wall, a long desk with three monitors and two towers along the back, a TV, a sofa, and a blue door. The background is the same warm rust as the reference render, and the gate/passcode screens now match it too.

Hovering anything clickable pops a label so a first-time visitor isn't guessing:

| Object | Label | Does |
|---|---|---|
| Bookshelves | Our books | a book for every year |
| Desk & monitors | Our computer | folders of photos |
| Wall clock | The clock | change the time of day |
| Blue door | Leave | lock up & sign out |

This model has no lamp and no window, so the **wall clock** takes over the day/night toggle — which reads better anyway. At night the monitors and the TV become the light sources.

#### Swapping the room again
All the room-specific detail sits in one `ROOM` block at the top of `src/scene.js` — model path, camera framing, background colours, glow positions, and the node names for each hotspot. Changing rooms means editing that block, not hunting through the file.

Be warned: this model's nodes are named `Plane.002_106`, `Cube.009_12` and so on, with nothing readable. I identified each hotspot by measuring every object's size and position and matching it against the reference render (the shelves are the 2.86-tall objects against the left wall, the desk is the 3.81-wide one along the back, the door is the 2.78-tall slab at the far right). If a hotspot ever stops responding, the error panel will say which one found no meshes.

A short guide card also appears on the first visit and never again after you dismiss it.

- **Lamp** only changes the lighting — no camera move. Sky, sun, ambient, fog, window glow, lamp bounce, monitor glow and moonlight all crossfade together.
- **Night is properly lit now.** The lamp casts real shadows, throws a warm bounce onto the wall and nightstand, the monitor gives off its own cool glow, moonlight comes through the window, and exposure lifts so the dark side of the room stays readable instead of going pure black.
- **Door** confirms, fades to black, and signs out.
- Orbit-drags no longer register as clicks.

### The shelf
Books are **actual 3D objects** now, not flat rectangles — each has a spine facing you, the front board hinged away into depth, a visible block of pages, and a top edge, all rotated in perspective. They lean slightly, vary in width and height, and turn further toward you on hover. Whatever you design on a book's spine shows here. Clicking one lifts it off the shelf, grows it to book size, swings the cover open on its hinge, then fades into the editor.

### If something breaks
There's now an **error panel** — bottom-left, red. If any part of the app throws, it shows the real message and stack instead of failing silently. That's what made the PC "just get stuck" before: something threw inside a timeout and nothing surfaced anywhere. Each module is also wired up separately now, so one failing piece can't take the rest down with it, and the PC boot has a hard 6-second failsafe that shows the desktop no matter what.

If you hit a problem, screenshot that panel — it says exactly what failed and where.

### Book covers (3D)
Clicking a book on the shelf now lifts it off and hands you the **cover in 3D** before you go inside:

- **It's a solid object now** — six faces: front board, spine, back board, the page block, and top and bottom edges showing the stacked sheets. Drag to rotate it freely on both axes. It drifts gently on its own until you touch it.
- **Design the front and the spine like a page.** "Design the front" and "Design the spine" open a flat editing canvas using the exact same system as the scrapbook pages — photos, notes in four styles, stickers, washi tape, and a paper backing. What you make gets flattened onto the 3D cover when you press Done.
- The spine you design **shows on the shelf**, so your books are individually recognisable there.
- Material, finish, and the three text lines (title, subtitle, signature) are still in the side panel for quick changes without opening the full editor.
- The page block's thickness grows with the number of pages.
- **"Open the book"** squares it up, swings the front cover on its hinge, and fades into the pages.

You can get back to the cover any time — leaving the editor returns you there, not straight to the shelf.

### The scrapbook editor
It's an actual book now, not a single sheet. Two pages open side by side, joined by a **spiral binding** — metal rings down the gutter, cover edges either side, and each page shaded where it curves into the spine. Pages turn two at a time like a real spread.

Click either page to make it active (it gets a gold outline); tools drop onto whichever page is highlighted.

**Pages are locked by default.** Nothing drags or resizes until you press **✎ Edit** (or hit `E`); pressing **✓ Done** saves and locks it all again. No mode-switching on every click — one button, and it sits at the left of the toolbar away from the tools.

**Paper looks like paper now** — kraft, dark kraft, cream, ruled, grid, dotted, linen, blush, sage, denim and charcoal. Each sheet gets printed lines or dots where appropriate, hundreds of fibre marks, darker recycled specks, uneven worn edges, light falloff, a shadow where it curves into the coil, and **punched holes down the gutter** that line up with the spiral rings.

- **Paper, not a Word doc.** Seven paper stocks (kraft, cream, linen, blush, sage, denim, charcoal), each rendered with hundreds of fibre speckles and edge shading so it reads as a real sheet.
- **Photos land as polaroids** — white border, heavy bottom margin, drop shadow, dropped in at a slight random angle. Frame options: polaroid (with a handwritten caption underneath), thin border, washi-taped corners, or bare.
- **Notes** in four styles: handwritten (Caveat), typewriter (Special Elite), serif (Playfair), or a raised index card.
- **Washi tape** and **stickers** you can place, drag, rotate, resize.
- **Layout presets** that scatter tape and note slots for common page shapes.
- **Page turning that behaves like paper, both directions.** The sheet is sliced into 20 vertical strips, each placed at the end of the previous one and rotated slightly further — accumulating those rotations builds a genuinely curved surface instead of a rigid plane. The curve's amplitude rises and falls across the turn so the bend travels like a wave, and every strip is shaded from its own facing angle so light moves across the paper as it lifts.

  Going **back** was broken before because a left-hand page hinges on its *right* edge, not its left, and the old code only ever integrated left-to-right. The reverse case now mirrors the whole layer and un-mirrors each strip's face, so the same maths drives both directions and backwards looks identical to forwards. Arrows either side, or ← / → keys.
- Double-click a note or a polaroid caption to edit it. Double-click a page name in the rail to rename it. Ctrl/Cmd-S saves.
- Pages are freeform — name them "January" or "Baguio trip" or anything. The month name is only a suggested default.

### The PC
Clicking the desk runs a **boot sequence with a real progress bar** — it tracks the actual work (reading your saved photos out of storage, which is the slow part), climbing on a curve and only completing once the data is ready. No more staring at a blank screen wondering if it froze.

Then: wallpaper, CRT scanline flicker, taskbar and clock.

- **Windows actually work now.** Drag them by the title bar, resize from the bottom-right grip, and the three dots do their real jobs — minimise (drops to the taskbar, click to restore), maximise (toggles full-screen), close. Multiple windows open at once and cascade so they don't hide each other; clicking one brings it to the front.
- **Folders** — `us`, `trips`, `random`, plus any you create. Double-click a photo to see it big in a white frame; right-click to delete.
- **Letters** — two `.txt` files sit on the desktop (`for_my_baby.txt` and `house_rules.txt`). They open in a window styled like real paper with typewriter text. Edit them in `DEFAULT_LETTERS` at the bottom of `src/books.js` — they're just strings, so write whatever you want.

### No more "localhost:5173 says"
Every native `alert` / `confirm` / `prompt` is gone, replaced by in-app dialogs that match the rest of the site — including a choice-list dialog for picking note styles and page layouts, and small toasts for confirmations. Nothing breaks the illusion anymore.

### Subtitles instead of a status box
The room used to show a fixed panel that repeated the same line. It now uses **cinematic subtitles** — a line fades in near the bottom, sits for a few seconds, then fades out. Lines vary rather than repeating: the lamp has three different night lines and three morning ones, picked at random.

### Motion
Every button has hover motion now — tool buttons lift and draw a gold underline, ghost buttons rise, the who-screen initials scale and tilt, book spines brighten and deepen their shadow, desktop icons lift and rotate slightly, stickers spin on hover, paper swatches pop. Nothing is static.

## Database

**This now supports Supabase.** See `SUPABASE-SETUP.md` — about fifteen minutes to connect, and it's what makes the project actually work for two people: shared books, photos in real file storage, backed up, no 5MB ceiling, real sign-in restricted to your two emails.

Without a `.env` the app falls back to localStorage exactly as before, so it still runs out of the box.

## Where your data lives without the database — read this

Everything (scrapbook pages, photos, PC folder photos) is saved in **this browser's localStorage**. That means:

- It exists **only on the device and browser you made it on.** Cherryl's phone will not see what you made on your laptop.
- Clearing browser data **deletes it permanently.** There is no backup.
- Photos are stored as base64 text, so the storage cap (usually ~5MB) fills up fast. Maybe 15–30 photos total, depending on size. You'll get an alert when a save fails.

**This is fine for trying it out. It is not fine for "long-term storage of our memories,"** which is what you said you want this for. For that you need a real backend — a database plus file storage for photos. Supabase is the natural fit here (free tier, handles both, and you've already used it on your other project). That's the next thing worth building, ahead of any more visual polish.

The whole storage layer is isolated in `src/books.js` — every other file goes through it, so swapping localStorage for Supabase means rewriting that one file, not the app.

## Passcode caveat

`06122026` sits in `src/main.js` as plain text. It stops casual visitors; it is not real security, since anyone can read the JavaScript in dev tools. For a private link nobody else knows, that's usually fine — just don't mistake it for a lock. Real protection means checking credentials on a server, which comes free with Supabase auth if you go that route.

## Changing things

| What | Where |
|---|---|
| Passcode | `CORRECT_PIN` in `src/main.js` |
| Names | `data-name` on the buttons in `index.html` |
| Paper stocks | `PAPERS` in `src/books.js` |
| Stickers | `STICKERS` in `src/editor.js` |
| Book spine colours | `SPINES` in `src/bookshelf-ui.js` |
| Page size | `PAGE_W` / `PAGE_H` in `src/editor.js` |
| Day/night look | `DAY` and `NIGHT` in `src/scene.js` |
| Room model & hotspots | `ROOM` at the top of `src/scene.js` |
| Hover labels | `HOTSPOT_INFO` in `src/scene.js` |
| Page-turn feel | `STRIPS` / `duration` in `src/page-flip.js` |
| The two letters | `DEFAULT_LETTERS` in `src/books.js` |
| Cover materials | `COVER_MATERIALS` in `src/books.js` |
| Paper stocks | `PAPERS` in `src/books.js` |
| Page size | `PAGE_W` / `PAGE_H` in `src/editor.js` |

## Files

```
our-room/
├── index.html         all screens
├── src/
│   ├── main.js         entry flow + passcode
│   ├── scene.js        three.js room, hotspots, day/night
│   ├── bookshelf-ui.js the shelf + book-opening animation
│   ├── editor.js       the scrapbook editor
│   ├── desktop-ui.js   the fake PC
│   ├── page-flip.js    the paper curl animation
│   ├── ui.js           dialogs, toasts, subtitles
│   ├── cover-ui.js     the 3D book cover
│   ├── surface.js      one editable canvas (pages + cover faces share it)
│   ├── elements.js     photos, notes, stickers, tape, paper
│   ├── errors.js       the visible error panel
│   ├── imgutil.js      image downscaling / compression
│   ├── books.js        ALL storage (swap this for Supabase)
│   └── style.css
└── public/models/room.glb
```

## Model licence

"Isometric room, house, game-ready, low poly." by **gbarzu**, CC-BY-4.0 via Sketchfab. That licence requires attribution — there's a credit line bottom-left in the room. Keep it.

## Pace
All the animations were too quick. Page turns went from 0.95s to 1.45s, the book lifting off the shelf from 0.55s to 0.95s, the cover opening from 1.6s to 2.3s, camera moves roughly 40% slower, day/night crossfade slower, and the cover's idle drift is calmer.

## Diagnostics

- `npm run doctor` — checks your Supabase setup from the terminal and names the exact problem.
- `npm run check` — verifies index.html's structure (balanced tags, overlays not nested inside each other).
- The red error panel prints real messages now, including Supabase's `{ message, code, details, hint }` objects, which used to render as `[object Object]`.

## Fixed in this pass — the PC, finally

The desktop was nested **inside** `#editor-overlay` in the HTML. A missing `</div>` (from an earlier edit of mine) meant `#desktop-overlay` became a child of the editor rather than its sibling — and since the editor is `display:none` unless open, the computer was being rendered inside a hidden parent. It never had a chance to appear, and nothing threw, which is why three rounds of reading the JavaScript found nothing.

There's now a structural test: `npm run check` (or `node tools/check-html.mjs`) verifies every tag is balanced and every overlay is a direct child of a `<section>`. I confirmed it fails on the exact bug it was written for.

## Fixed in the previous pass (storage)

**The PC hanging — the real cause.** `getPcFolders()` had a `localStorage.setItem` sitting *outside* its try/catch. Once storage filled up, that threw `QuotaExceededError`, which escaped the function, killed `renderIcons()`, and left the boot screen up forever. Every storage read and write in the app now goes through guarded `safeRead` / `safeWrite` helpers, so a full disk degrades instead of exploding.

**Why storage was filling.** Photos were being stored as raw base64 exactly as the file picker handed them over — a single phone photo is 3–5MB, which on its own can exhaust the ~5MB budget. And I was saving cover snapshots as PNG at 2× scale, which made it worse. Now:

- Every photo is downscaled to 1100px and re-encoded as JPEG at 0.82 quality before it's stored — typically **30–60× smaller**, with no visible difference at the sizes shown.
- Cover snapshots are JPEG at 1.4× instead of PNG at 2×.
- There's a **storage meter** in the cover's edit panel showing how much of the budget you've used, so you can see it coming rather than hitting a wall.

This buys a lot of headroom, but it doesn't change the fundamental limit — see the storage section above. A real database is still the right answer.

## Also in this pass

- **The landing page no longer prints your passcode.** "EST. 06 · 12 · 2026" was sitting right above the Enter button. It now reads "ours only".
- **The cover opens in clean view mode.** Just the book, rotatable, with "Open the book". The editing panel is behind an **✎ Edit** button next to Shelf, so you're not looking at controls you didn't ask for.
- **The lift-off animation shows your actual cover art** instead of a plain coloured slab.
- The cover editor's note button is labelled **Text** — it adds free text in four styles anywhere on the front or spine.

## Fixed in earlier passes

- **Photos drifting after save.** Resizing a photo left a scale factor on its group that never got reset, so the saved width was the scaled size while the frame padding was recalculated unscaled — everything shifted slightly on reload. Resizes are now baked into real pixel dimensions with the scale reset to 1, so what you see is exactly what's stored. Tape colours are stored too, instead of being re-rolled at random on every reload.
- **The PC hanging.** An earlier edit removed the photo-viewer markup while the desktop code still expected it, so `initDesktop` threw on a null element and took the rest of the room's setup down with it. The markup is back and every element reference is now checked against the HTML.
- **Backwards page turns**, **the shelf having no back button**, and **native `localhost says` dialogs** — all addressed in earlier passes.

## Honest list of what's still missing

- **Real persistence** (the big one — see above)
- The door doesn't swing open; it just confirms and fades
- The new model is 17MB, so first load takes a moment — the progress bar shows real percentage
- Photos aren't compressed before storing, which is why storage fills quickly
- No undo in the editor
- Windows don't snap to edges, and there's no double-click-titlebar-to-maximise
- Not tested on mobile