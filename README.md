# Workhorse Strong — Client Portal

Black, white, burnt orange. Built to replace Trainerize.

## What's inside

**Client app (mobile web)**
- Home — daily macros vs targets, weekly session count
- Train — view assigned program, log sets (weight / reps / RIR)
- Eat — log meals, live macro tracking against coach-set targets
- Check-in — weekly weight/waist/sleep/energy/hunger + progress photos
- Coach — real-time chat

**Coach dashboard (desktop)**
- Clients — set each client's name, phase, and macro targets
- Programs — build programs (days → exercises with sets/reps/RIR), assign to clients
- Check-ins — review submissions, view photos, send feedback
- Messages — chat with any client

## Setup (~30 minutes)

### 1. Supabase (free tier)
1. supabase.com → New project → name it `workhorse-strong`
2. SQL Editor → New query → paste ALL of `src/lib/schema.sql` → Run
3. Settings → API → copy the Project URL and anon (public) key

### 2. Local
```bash
cp .env.example .env    # paste your Supabase URL + anon key
npm install
npm run dev
```

### 3. Make yourself the coach
1. Supabase → Authentication → Users → Add user (your email + password)
2. Supabase → Table Editor → profiles → your row → change `role` to `coach`
3. Sign in at localhost:5173 — you'll land on the coach dashboard

### 4. Invite a client
1. Authentication → Users → Add user (their email + a temp password)
2. They sign in → they land on the client app
3. In your Clients tab, set their name, phase, and macros
4. Build a program in Programs and assign it to them

### 5. Deploy to Vercel (free)
1. Push this folder to a GitHub repo
2. vercel.com → New project → import the repo
3. Add both env vars from your `.env` in Vercel's project settings
4. Deploy — then add your Vercel URL to Supabase → Authentication → URL Configuration → Site URL

## Stack
React + Vite · Supabase (Postgres, auth, storage, realtime) · Vercel · Montserrat

## Monthly costs
$0 until you outgrow the free tiers (roughly 50+ active clients), then ~$45/mo.
Trainerize at that size runs $150–250/mo.
