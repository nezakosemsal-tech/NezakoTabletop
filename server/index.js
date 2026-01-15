const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH'] }
});
const PORT = process.env.PORT || 3000;

// Pastas para mapas e tokens
const MAPS_DIR = path.join(__dirname, 'maps');
const TOKENS_DIR = path.join(__dirname, 'tokens');
if (!fs.existsSync(MAPS_DIR)) fs.mkdirSync(MAPS_DIR);
if (!fs.existsSync(TOKENS_DIR)) fs.mkdirSync(TOKENS_DIR);

// Multer para mapas
const mapStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MAPS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + '-' + file.originalname)
});
const uploadMap = multer({ storage: mapStorage });

// Multer para tokens
const tokenStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TOKENS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + '-' + file.originalname)
});
const uploadToken = multer({ storage: tokenStorage });

app.use(cors());
app.use(express.json());
app.use('/maps', express.static(MAPS_DIR));
app.use('/tokens', express.static(TOKENS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory session store
const sessions = {};

// Função para registrar log de ação
function addLog(session, action, data) {
  if (!session.logs) session.logs = [];
  session.logs.push({
    action,
    data,
    timestamp: new Date().toISOString(),
  });
}

// Função utilitária para rolar dados (ex: 2d6+1)
function rollDice(formula) {
  const match = formula.match(/(\d*)d(\d+)([+-]\d+)?/i);
  if (!match) return null;
  const count = parseInt(match[1] || '1', 10);
  const sides = parseInt(match[2], 10);
  const mod = match[3] ? parseInt(match[3], 10) : 0;
  const rolls = [];
  for (let i = 0; i < count; i++) rolls.push(1 + Math.floor(Math.random() * sides));
  const total = rolls.reduce((a, b) => a + b, 0) + mod;
  return { formula, rolls, mod, total };
}

// Rota principal amigável
app.get('/', (req, res) => {
  res.send('<h1>NezakoTabletop API Online</h1><p>Use as rotas da API para interagir com o servidor.</p>');
});

// Criar uma nova sala
app.post('/sessions', (req, res) => {
  const { name, password, master } = req.body;
  if (!name || !master) {
    return res.status(400).json({ error: 'Name and master required' });
  }
  const id = uuidv4();
  sessions[id] = {
    id,
    name,
    password: password || null,
    master: { name: master, id: uuidv4() },
    players: [],
    chat: [],
    maps: [],
    tokens: [],
    drawings: [],
    measurements: [],
    rolls: [],
    logs: [],
    createdAt: new Date().toISOString(),
  };
  addLog(sessions[id], 'room_created', { master: master });
  res.status(201).json({ id, name, master: sessions[id].master });
});

// Entrar em uma sala
app.post('/sessions/:id/join', (req, res) => {
  const { id } = req.params;
  const { player, password } = req.body;
  if (!sessions[id]) {
    return res.status(404).json({ error: 'Room not found' });
  }
  if (sessions[id].password && sessions[id].password !== password) {
    return res.status(403).json({ error: 'Invalid password' });
  }
  if (!player) {
    return res.status(400).json({ error: 'Player name required' });
  }
  const playerObj = { name: player, id: uuidv4() };
  sessions[id].players.push(playerObj);
  addLog(sessions[id], 'player_join', { player: playerObj });
  res.json({ room: { id: sessions[id].id, name: sessions[id].name }, player: playerObj });
});

// Listar todas as salas (sem senha)
app.get('/sessions', (req, res) => {
  const list = Object.values(sessions).map(({ id, name, players, master, createdAt }) => ({
    id, name, playerCount: players.length, master: master ? master.name : null, createdAt
  }));
  res.json(list);
});

// Chat: enviar mensagem para uma sala
app.post('/sessions/:id/chat', (req, res) => {
  const { id } = req.params;
  const { player, message } = req.body;
  if (!sessions[id]) {
    return res.status(404).json({ error: 'Room not found' });
  }
  if (!player || !message) {
    return res.status(400).json({ error: 'Player and message required' });
  }
  const chatMsg = {
    player,
    message,
    timestamp: new Date().toISOString(),
  };
  sessions[id].chat.push(chatMsg);
  addLog(sessions[id], 'chat_message', { player, message });
  res.status(201).json(chatMsg);
});

// Chat: obter mensagens de uma sala
app.get('/sessions/:id/chat', (req, res) => {
  const { id } = req.params;
  if (!sessions[id]) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json(sessions[id].chat);
});

// Upload de mapa
app.post('/sessions/:id/maps', uploadMap.single('map'), (req, res) => {
  const { id } = req.params;
  if (!sessions[id]) {
    return res.status(404).json({ error: 'Room not found' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Map file required' });
  }
  const map = {
    id: uuidv4(),
    filename: req.file.filename,
    originalname: req.file.originalname,
    path: req.file.path,
    uploadedAt: new Date().toISOString(),
  };
  sessions[id].maps.push(map);
  addLog(sessions[id], 'map_uploaded', { mapId: map.id, filename: map.originalname });
  res.status(201).json(map);
});

// Listar mapas de uma sala
app.get('/sessions/:id/maps', (req, res) => {
  const { id } = req.params;
  if (!sessions[id]) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json(sessions[id].maps);
});

// Upload de token
app.post('/sessions/:id/tokens', uploadToken.single('token'), (req, res) => {
  const { id } = req.params;
  if (!sessions[id]) {
    return res.status(404).json({ error: 'Room not found' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Token file required' });
  }
  const token = {
    id: uuidv4(),
    filename: req.file.filename,
    originalname: req.file.originalname,
    path: req.file.path,
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    uploadedAt: new Date().toISOString(),
  };
  sessions[id].tokens.push(token);
  addLog(sessions[id], 'token_uploaded', { tokenId: token.id, filename: token.originalname });
  res.status(201).json(token);
});

// Atualizar token (posição, tamanho)
app.patch('/sessions/:id/tokens/:tokenId', (req, res) => {
  const { id, tokenId } = req.params;
  const { x, y, width, height } = req.body;
  if (!sessions[id]) {
    return res.status(404).json({ error: 'Room not found' });
  }
  const token = sessions[id].tokens.find(t => t.id === tokenId);
  if (!token) {
    return res.status(404).json({ error: 'Token not found' });
  }
  if (x !== undefined) token.x = x;
  if (y !== undefined) token.y = y;
  if (width !== undefined) token.width = width;
  if (height !== undefined) token.height = height;
  addLog(sessions[id], 'token_updated', { tokenId, x, y, width, height });
  res.json(token);
});

// Listar tokens de uma sala
app.get('/sessions/:id/tokens', (req, res) => {
  const { id } = req.params;
  if (!sessions[id]) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json(sessions[id].tokens);
});

// Adicionar desenho
app.post('/sessions/:id/drawings', (req, res) => {
  const { id } = req.params;
  const { type, points, color, width } = req.body;
  if (!sessions[id]) {
    return res.status(404).json({ error: 'Room not found' });
  }
  if (!type || !points) {
    return res.status(400).json({ error: 'Type and points required' });
  }
  const drawing = {
    id: uuidv4(),
    type,
    points,
    color: color || '#000000',
    width: width || 2,
    createdAt: new Date().toISOString(),
  };
  sessions[id].drawings.push(drawing);
  addLog(sessions[id], 'drawing_added', { drawingId: drawing.id, type });
  res.status(201).json(drawing);
});

// Listar desenhos de uma sala
app.get('/sessions/:id/drawings', (req, res) => {
  const { id } = req.params;
  if (!sessions[id]) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json(sessions[id].drawings);
});

// Adicionar medição
app.post('/sessions/:id/measurements', (req, res) => {
  const { id } = req.params;
  const { startX, startY, endX, endY, color, width } = req.body;
  if (!sessions[id]) {
    return res.status(404).json({ error: 'Room not found' });
  }
  if (startX === undefined || startY === undefined || endX === undefined || endY === undefined) {
    return res.status(400).json({ error: 'Start and end coordinates required' });
  }
  const measurement = {
    id: uuidv4(),
    startX,
    startY,
    endX,
    endY,
    color: color || '#FF0000',
    width: width || 2,
    createdAt: new Date().toISOString(),
  };
  sessions[id].measurements.push(measurement);
  addLog(sessions[id], 'measurement_added', { measurementId: measurement.id });
  res.status(201).json(measurement);
});

// Listar medições de uma sala
app.get('/sessions/:id/measurements', (req, res) => {
  const { id } = req.params;
  if (!sessions[id]) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json(sessions[id].measurements);
});

// REST: rolar dados em uma sala
app.post('/sessions/:id/roll', (req, res) => {
  const { id } = req.params;
  const { player, formula } = req.body;
  if (!sessions[id]) {
    return res.status(404).json({ error: 'Room not found' });
  }
  if (!player || !formula) {
    return res.status(400).json({ error: 'Player and formula required' });
  }
  const result = rollDice(formula);
  if (!result) {
    return res.status(400).json({ error: 'Invalid dice formula' });
  }
  const roll = {
    player,
    formula,
    rolls: result.rolls,
    mod: result.mod,
    total: result.total,
    timestamp: new Date().toISOString(),
  };
  if (!sessions[id].rolls) sessions[id].rolls = [];
  sessions[id].rolls.push(roll);
  addLog(sessions[id], 'dice_roll', { player, formula, total: result.total });
  res.status(201).json(roll);
  // Emitir via WebSocket
  io.to(id).emit('diceRoll', roll);
});

// REST: listar rolagens de uma sala
app.get('/sessions/:id/rolls', (req, res) => {
  const { id } = req.params;
  if (!sessions[id]) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json(sessions[id].rolls || []);
});

// Logs: obter logs de uma sala
app.get('/sessions/:id/logs', (req, res) => {
  const { id } = req.params;
  if (!sessions[id]) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json(sessions[id].logs);
});

// --- WebSocket ---
io.on('connection', (socket) => {
  // Entrar em uma sala
  socket.on('joinRoom', ({ roomId, player }) => {
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.player = player;
    socket.to(roomId).emit('playerJoined', { player });
  });

  // Mensagem de chat
  socket.on('chatMessage', ({ roomId, player, message }) => {
    io.to(roomId).emit('chatMessage', { player, message, timestamp: new Date().toISOString() });
  });

  // Token adicionado/movido
  socket.on('tokenUpdate', ({ roomId, player, token, action }) => {
    io.to(roomId).emit('tokenUpdate', { player, token, action });
  });

  // Desenho adicionado
  socket.on('drawing', ({ roomId, drawing }) => {
    io.to(roomId).emit('drawing', drawing);
  });

  // Medição adicionada
  socket.on('measurement', ({ roomId, measurement }) => {
    io.to(roomId).emit('measurement', measurement);
  });

  // Rolagem de dados
  socket.on('rollDice', ({ roomId, player, formula }) => {
    const result = rollDice(formula);
    if (!result) return;
    const roll = {
      player,
      formula,
      rolls: result.rolls,
      mod: result.mod,
      total: result.total,
      timestamp: new Date().toISOString(),
    };
    if (!sessions[roomId]) return;
    if (!sessions[roomId].rolls) sessions[roomId].rolls = [];
    sessions[roomId].rolls.push(roll);
    addLog(sessions[roomId], 'dice_roll_ws', { player, formula, total: result.total });
    io.to(roomId).emit('diceRoll', roll);
  });

  // Sair da sala
  socket.on('disconnecting', () => {
    const roomId = socket.data.roomId;
    const player = socket.data.player;
    if (roomId && player) {
      socket.to(roomId).emit('playerLeft', { player });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Tabletop server running on port ${PORT}`);
});