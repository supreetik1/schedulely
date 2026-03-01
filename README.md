# Schedulely

Schedulely is a student-focused scheduling app prototype built with Next.js.

## Features

- Column-based task input (task, deadline, estimated minutes)
- CSV task import
- AI-style schedule generation (local simulation for now)
- Sleep questionnaire used to shape study and rest timing
- Daily check-ins for mood, eating, and sleep quality with wellness suggestions
- Loading overlay while schedule generation is in progress
- Unlimited schedule generation
- Built-in break blocks between tasks
- Wellness checks inserted every 3-4 tasks (or immediately after 1-2 tasks when applicable)
- Dynamic schedule adjustment from wellness response (shorter non-exam blocks when overwhelmed, more exam focus time)

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Notes

- Generation logic is currently deterministic and local; no external AI API is wired yet.
