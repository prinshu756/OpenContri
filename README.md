# OpenContri GitHub Tracker

A Next.js dashboard for tracking GitHub repositories, open issues, and live notifications.

## Features

- Track any GitHub repo by pasting a `owner/repo` string or GitHub URL
- See current open issues and issue metadata
- Save a watchlist of recently tracked repos
- In-app notifications for newly opened issues
- Clean, modern dashboard UI with auto-refresh

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env.local` file in the project root:

```env
GITHUB_TOKEN=your_github_token_here
```

A GitHub token is recommended to avoid rate limiting.

3. Run the app locally:

```bash
npm run dev
```

4. Open the site at:

```text
http://localhost:3000
```

## Usage

- Paste a GitHub repository link or `owner/repo` string into the input field.
- Click `Track repo` to load open issues.
- The app refreshes data every 30 seconds while a repo is selected.
- Notifications appear when new open issues are detected.

## Notes

- The site stores your watchlist in `localStorage`.
- No server-side database is required for the initial tracking experience.
