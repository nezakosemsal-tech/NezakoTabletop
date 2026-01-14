# NezakoTabletop - Simple Tabletop Game Server

This is a minimal Node.js backend for a tabletop game. It provides a REST API to create, join, and list game sessions.

## Setup

1. Navigate to the `server` directory:
   ```sh
   cd server
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Start the server:
   ```sh
   npm start
   ```

## API Endpoints

- `POST /sessions` - Create a new game session
- `POST /sessions/:id/join` - Join an existing session
- `GET /sessions` - List all sessions

## Deployment

- Use `npm install` as the build command
- Use `npm start` as the start command

---

This project is ready for Render or similar cloud platforms.
