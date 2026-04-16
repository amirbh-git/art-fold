# Setup guide (beginner-friendly, Mac)

This walks you from “I have the project folder” to “the site runs in my browser.” You can do almost everything by copying and pasting commands into **Terminal**.

---

## Part 1: Open Terminal

1. Press **Command + Space** on your keyboard (hold Command, tap Space).  
   A search box opens (Spotlight).
2. Type **Terminal** and press **Enter**.  
   A window opens with text and a blinking cursor. That is **Terminal**.

You will type (or paste) commands here and press **Enter** to run each one.

**Tip:** To paste into Terminal, use **Command + V** (not right-click, unless you enable it in Terminal settings).

---

## Part 2: Install Node.js (lets the app run)

Node.js is software your computer needs to run this project.

1. Open your web browser and go to: **https://nodejs.org**
2. Download the **LTS** version (the green button). It is the stable, recommended one.
3. Open the downloaded file and complete the installer.  
   Use the default options (keep clicking Continue / Install).
4. **Fully quit Terminal** (Terminal menu → Quit Terminal), then open Terminal again (Part 1).  
   This makes sure it sees Node.

**Check that it worked:** in Terminal, paste this line and press Enter:

```bash
node -v
```

You should see something like `v22.x.x` or `v20.x.x`.  
If you see an error like “command not found,” Node did not install correctly—try restarting the computer and running `node -v` again.

---

## Part 3: Go to the project folder in Terminal

Your project lives here (already on your Mac from Cursor):

`/Users/amir/Documents/cursor_projects/digital-exhibit`

In Terminal, **paste this entire line** and press **Enter**:

```bash
cd /Users/amir/Documents/cursor_projects/digital-exhibit
```

**What this does:** `cd` means “change directory”—you are now *inside* the project folder.  
Every command after this should be run **while you are in this folder** (same Terminal window).

**Check that you are in the right place:** paste:

```bash
pwd
```

Press Enter. It should print:

`/Users/amir/Documents/cursor_projects/digital-exhibit`

---

## Part 4: A database (where exhibits are saved)

The app needs **PostgreSQL**. The easiest way for beginners is a **free online database** (no Docker, no extra apps). We use **Neon** as an example; others like Supabase or Railway work similarly if you already use them.

### 4a. Create a free database (Neon)

1. In your browser, go to **https://neon.tech** and sign up (you can use GitHub or email).
2. Create a **new project** (any name is fine). Neon may ask a few extra questions—here is what to pick for **this** app:
   - **Postgres version:** Use Neon’s **default** or **newest** version they offer (often **16** or **17**). Anything **15 or newer** is fine; you do not need a specific number for this tutorial.
   - **Region:** Pick the region **closest to where you are** (or closest to where you will deploy the site later, for example the same continent as **Vercel** if you use that). Closer = slightly snappier. If you are unsure, the **recommended** region Neon shows first is a safe choice.
   - **Neon Auth:** Leave it **off** (the default). This project only needs a normal Postgres **connection string** in `.env`. “Neon Auth” is a separate login product for apps; turning it on is not required and would not match the current code unless you changed the app on purpose.
3. Neon will show a **connection string** that looks like:

   `postgresql://username:password@something.aws.neon.tech/neondb?sslmode=require`

4. **Copy that entire string** and keep it somewhere safe (Notes app is fine).  
   You will paste it into a file in the next step.

**Do not share this string publicly**—it is like a password to your database.

### 4b. Create the `.env` file

The app reads database settings from a file named **`.env`** in the project folder.

**Option A — using Cursor (recommended if you already use Cursor)**

1. In Cursor: **File → Open Folder…**
2. Choose the folder **digital-exhibit** (inside `cursor_projects`).
3. In the left file list, click **New File**.
4. Name the file exactly: **`.env`** (starts with a dot).
5. Put **exactly one line** in the file (replace the part in quotes with your Neon string):

   ```
   DATABASE_URL="paste-your-neon-connection-string-here"
   ```

6. Save the file (**Command + S**).

**Option B — using Terminal only**

1. In Terminal, make sure you are still in the project folder (Part 3).
2. Run:

   ```bash
   cp .env.example .env
   ```

3. Open the file in a simple editor:

   ```bash
   open -e .env
   ```

   This opens **TextEdit**. You will see a sample `DATABASE_URL` line.
4. Replace the value with your **real** Neon connection string (inside the quotes).
5. Save and close TextEdit.

---

## Part 5: Install project dependencies

In Terminal (still in the `digital-exhibit` folder), paste:

```bash
npm install
```

Wait until it finishes (can take a few minutes).  
If you see **errors** in red, copy the last 20–30 lines and ask for help.

---

## Part 6: Create the database tables

Still in the same folder, paste:

```bash
npx prisma migrate deploy
```

Press Enter.  
This tells the database to create the tables the app needs.

If this fails with “Can’t reach database” or “connection refused,” your `DATABASE_URL` in `.env` is wrong or the Neon project is paused—double-check the string in Neon’s dashboard.

---

## Part 7: Start the website

Paste:

```bash
npm run dev
```

When it works, Terminal will say something like **“Ready”** and show **http://localhost:3000**.

1. Open **Safari** or **Chrome**.
2. In the address bar, type: **http://localhost:3000** and press Enter.

You should see the **Digital exhibit** page.

**To stop the server:** click the Terminal window and press **Control + C** (hold Control, press C).

---

## Part 8 (optional): Better share links in production

When you deploy the site to the real internet, set this in `.env` so link previews work:

```
NEXT_PUBLIC_APP_URL="https://your-real-domain.com"
```

For local testing on your Mac only, you can skip this.

---

## Part 9 (optional): Harvard Art Museums in the card mix

The swipe deck can include works from **Harvard Art Museums** when you add a (free) API key. Without it, the app still uses The Met, the Art Institute of Chicago, and the Cleveland Museum of Art.

1. Request a key from **https://harvardartmuseums.org/collections/api** (Harvard’s signup is free; usage is subject to their terms).
2. In your `.env` file, add:

   ```
   HARVARD_ART_API_KEY="paste-your-key-here"
   ```

3. Restart `npm run dev` so the server picks up the new variable.

---

## Quick reference (all commands in order)

Run these in Terminal, one after another, from the `digital-exhibit` folder:

```bash
cd /Users/amir/Documents/cursor_projects/digital-exhibit
node -v
npm install
npx prisma migrate deploy
npm run dev
```

Then open **http://localhost:3000** in your browser.

---

## If you get stuck

Write down:

1. Which **step number** you were on  
2. The **exact error message** (copy from Terminal)  
3. The output of `node -v`

That is enough for someone to help you quickly.

---

## Alternative: database on your Mac with Docker

Only use this if you already use **Docker Desktop** and are comfortable with it.

1. Install Docker Desktop from **https://www.docker.com/products/docker-desktop/**
2. In the `digital-exhibit` folder, run: `docker compose up -d`
3. In `.env`, set:

   `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/digital_exhibit?schema=public"`

4. Then run `npx prisma migrate deploy` and `npm run dev` as above.

If you are not already using Docker, **Neon (Part 4) is simpler**.
