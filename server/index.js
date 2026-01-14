const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// In-memory session store
const sessions = {};

// Create a new game session
app.post('/sessions', (req, res) => {
  const sessionId = uuidv4();
  sessions[sessionId] = {
    id: sessionId,
    players: [],
    createdAt: new Date().toISOString(),
  };
  res.status(201).json(sessions[sessionId]);
});

// Join an existing session
app.post('/sessions/:id/join', (req, res) => {
  const { id } = req.params;
  const { player } = req.body;
  if (!sessions[id]) {
    return res.status(404).json({ error: 'Session not found' });
  }
  if (!player) {
    return res.status(400).json({ error: 'Player name required' });
  }
  sessions[id].players.push(player);
  res.json(sessions[id]);
});

// List all sessions
app.get('/sessions', (req, res) => {
  res.json(Object.values(sessions));
});

app.listen(PORT, () => {
  console.log(`Tabletop server running on port ${PORT}`);
});
