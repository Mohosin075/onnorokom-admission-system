# Admission frontend

React 19, TypeScript and Vite frontend for the school admission assignment.
See the repository [README](../README.md) for Docker startup and all test commands.

For local development, copy `.env.example` to `.env`, run `npm ci` and `npm run dev`.
The default URL is http://localhost:3000 and VITE_API_URL defaults to
http://localhost:8080. Use `npm test`, `npm run lint` and `npm run build` to verify.

New users enter their own 17-digit student ID. The browser remembers identity and
selected applications when localStorage is available; the API stores admission data.
