# MovieLogger — Setup Guide

## 1. Install Dependencies

```bash
npm install
```

## 2. Environment Variables

Copy `.env.local.example` to `.env.local`:

```bash
cp .env.local.example .env.local
```

Fill in:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# TMDB API
NEXT_PUBLIC_TMDB_API_KEY=...
NEXT_PUBLIC_TMDB_BASE_URL=https://api.themoviedb.org/3
NEXT_PUBLIC_TMDB_IMAGE_BASE_URL=https://image.tmdb.org/t/p
```

---

## 3. Firebase Setup

### 3a. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project
3. Enable **Authentication** → Sign-in Methods:
   - Email/Password
   - Google
4. Create a **Firestore Database** (production mode)
5. Copy your web app config to `.env.local`

### 3b. Deploy Firestore Security Rules

```bash
npm install -g firebase-tools
firebase login
firebase init firestore
```
Copy the rules from `firestore.rules` into your Firebase project.

### 3c. Firestore Indexes

Create composite indexes in the Firebase Console:

| Collection | Fields | Order |
|---|---|---|
| `mediaEntries` | `userId` (ASC), `createdAt` (DESC) | |
| `mediaEntries` | `userId` (ASC), `title` (ASC) | |
| `mediaEntries` | `userId` (ASC), `tmdbId` (ASC) | |

---

## 4. TMDB API Setup

1. Go to [TMDB](https://www.themoviedb.org/settings/api)
2. Create a free account
3. Request an API key (v3 auth)
4. Add it to `.env.local` as `NEXT_PUBLIC_TMDB_API_KEY`

---

## 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 6. Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Or push to GitHub and connect to Vercel:

1. Push to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project
3. Import your GitHub repo
4. Add all environment variables from `.env.local`
5. Deploy

---

## Folder Structure

```
movielogger/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # Auth pages (login/signup)
│   ├── (protected)/            # Protected pages (dashboard, list, etc.)
│   ├── layout.tsx              # Root layout
│   └── globals.css             # Global styles
├── components/
│   ├── auth/                   # Auth forms + provider
│   ├── common/                 # GlassCard, LoadingSpinner
│   ├── dashboard/              # Charts, stats, projections
│   ├── import/                 # Import dropzone + preview
│   ├── layout/                 # BottomNav, AppLayout
│   ├── media/                  # MediaCard, FilterBar, AddEntryForm
│   └── ui/                     # shadcn/ui base components
├── hooks/                      # useAuth, useMedia, useTMDB
├── lib/
│   ├── export/                 # Excel/CSV export
│   ├── firebase/               # Firebase config, auth, firestore
│   ├── import/                 # File parser, column mapper
│   └── tmdb/                   # TMDB API client
├── store/                      # Zustand stores (auth, media)
├── types/                      # TypeScript types
└── utils/                      # Formatters, watch time, ID generator
```

---

## Internal ID System

Every entry gets a unique ID like `ML-000001`, `ML-000002`.
This is separate from TMDB IDs. Generated via Firestore transactions per user.

---

## Import Format

### Supported Columns (flexible naming)

| Field | Aliases |
|---|---|
| Title | "Title", "Movie Title", "Name", "Film" |
| Type | "Type", "Media Type", "Kind" |
| Status | "Status", "Watch Status" |
| Year Made | "Year", "Release Year", "Year Made" |
| Total Episodes | "Episodes", "Total Episodes" |
| Episode Duration | "Episode Duration", "Runtime", "Duration" |
| Watch Hours | "Watch Hours", "Hours Watched" |
| Personal Rating | "Rating", "My Rating", "Score" |
| Age Rating | "Age Rating", "Content Rating", "Rated" |
| Genres | "Genre", "Genres", "Tags" |
| Country | "Country", "Origin" |
| Date Finished | "Date Finished", "Watched On" |
| Special Notes | "Notes", "Comments" |
| TMDB ID | "TMDB ID", "TMDB" |

Status values: `completed`, `watching`, `planned`, `dropped`, `on_hold`  
Type values: `movie`, `series`
