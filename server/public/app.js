// Mobile-friendly NezakoTabletop Frontend
const API_BASE = window.location.origin;
let socket;
let currentRoom = null;
let currentPlayer = null;

// DOM elements
const screens = {
    main: document.getElementById('main-menu'),
    create: document.getElementById('create-room'),
    join: document.getElementById('join-room'),
    list: document.getElementById('room-list'),
    game: document.getElementById('game-room')
};

const loading = document.getElementById('loading');
const error = document.getElementById('error');

// Utility functions
function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[screenName].classList.add('active');
}

function showLoading(message = 'Carregando...') {
    loading.textContent = message;
    loading.style.display = 'block';
}

function hideLoading() {
    loading.style.display = 'none';
}

function showError(message) {
    error.textContent = message;
    error.style.display = 'block';
    setTimeout(() => error.style.display = 'none', 3000);
}

function hideError() {
    error.style.display = 'none';
}

// API calls
async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            headers: { 'Content-Type': 'application/json' },
            ...options
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Erro na API');
        return data;
    } catch (err) {
        showError(err.message);
        throw err;
    }
}

// Room management
async function createRoom(name, master, password) {
    showLoading('Criando sala...');
    try {
        const room = await apiCall('/sessions', {
            method: 'POST',
            body: JSON.stringify({ name, master, password })
        });
        currentRoom = room;
        currentPlayer = { name: master, id: room.master.id };
        connectSocket();
        showScreen('game');
        updateRoomDisplay();
    } catch (err) {
        // Error already shown
    } finally {
        hideLoading();
    }
}

async function joinRoom(roomId, playerName, password) {
    showLoading('Entrando na sala...');
    try {
        const data = await apiCall(`/sessions/${roomId}/join`, {
            method: 'POST',
            body: JSON.stringify({ player: playerName, password })
        });
        currentRoom = data.room;
        currentPlayer = data.player;
        connectSocket();
        showScreen('game');
        updateRoomDisplay();
    } catch (err) {
        // Error already shown
    } finally {
        hideLoading();
    }
}

async function listRooms() {
    showLoading('Carregando salas...');
    try {
        const rooms = await apiCall('/sessions');
        displayRooms(rooms);
        showScreen('list');
    } catch (err) {
        // Error already shown
    } finally {
        hideLoading();
    }
}

function displayRooms(rooms) {
    const container = document.getElementById('rooms-container');
    container.innerHTML = '';

    if (rooms.length === 0) {
        container.innerHTML = '<p>Nenhuma sala disponível.</p>';
        return;
    }

    rooms.forEach(room => {
        const roomDiv = document.createElement('div');
        roomDiv.className = 'room-item';
        roomDiv.innerHTML = `
            <h3>${room.name}</h3>
            <p>Jogadores: ${room.playerCount} | Mestre: ${room.master}</p>
            <p>Criada em: ${new Date(room.createdAt).toLocaleString()}</p>
            <button class="btn small" onclick="quickJoin('${room.id}')">Entrar</button>
        `;
        container.appendChild(roomDiv);
    });
}

function quickJoin(roomId) {
    const playerName = prompt('Seu nome:');
    if (playerName) {
        document.getElementById('join-room-id').value = roomId;
        document.getElementById('player-name').value = playerName;
        showScreen('join');
    }
}

// Socket.IO connection
function connectSocket() {
    if (socket) socket.disconnect();
    socket = io(API_BASE);

    socket.on('connect', () => {
        socket.emit('joinRoom', { roomId: currentRoom.id, player: currentPlayer.name });
    });

    socket.on('playerJoined', ({ player }) => {
        addChatMessage(`🎲 ${player.name} entrou na sala!`);
    });

    socket.on('playerLeft', ({ player }) => {
        addChatMessage(`👋 ${player.name} saiu da sala.`);
    });

    socket.on('chatMessage', ({ player, message, timestamp }) => {
        addChatMessage(`${player}: ${message}`, timestamp);
    });

    socket.on('diceRoll', (roll) => {
        displayDiceRoll(roll);
    });
}

// UI updates
function updateRoomDisplay() {
    document.getElementById('room-title').textContent = `${currentRoom.name} - ${currentPlayer.name}`;
}

function addChatMessage(message, timestamp = null) {
    const messagesDiv = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    messageDiv.innerHTML = `<strong>${timestamp ? new Date(timestamp).toLocaleTimeString() + ' ' : ''}</strong>${message}`;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function displayDiceRoll(roll) {
    const resultsDiv = document.getElementById('dice-results');
    const rollDiv = document.createElement('div');
    rollDiv.className = 'dice-roll';
    rollDiv.innerHTML = `
        <strong>${roll.player}</strong> rolou <strong>${roll.formula}</strong><br>
        Resultados: ${roll.rolls.join(', ')} ${roll.mod !== 0 ? (roll.mod > 0 ? '+' + roll.mod : roll.mod) : ''}<br>
        <strong>Total: ${roll.total}</strong>
    `;
    resultsDiv.appendChild(rollDiv);
    resultsDiv.scrollTop = resultsDiv.scrollHeight;
}

// Event listeners
document.getElementById('create-room-btn').addEventListener('click', () => showScreen('create'));
document.getElementById('join-room-btn').addEventListener('click', () => showScreen('join'));
document.getElementById('list-rooms-btn').addEventListener('click', () => listRooms());

document.getElementById('create-btn').addEventListener('click', () => {
    const name = document.getElementById('room-name').value.trim();
    const master = document.getElementById('master-name').value.trim();
    const password = document.getElementById('room-password').value;
    if (name && master) {
        createRoom(name, master, password);
    } else {
        showError('Preencha nome da sala e mestre');
    }
});

document.getElementById('join-btn').addEventListener('click', () => {
    const roomId = document.getElementById('join-room-id').value.trim();
    const playerName = document.getElementById('player-name').value.trim();
    const password = document.getElementById('join-password').value;
    if (roomId && playerName) {
        joinRoom(roomId, playerName, password);
    } else {
        showError('Preencha ID da sala e seu nome');
    }
});

document.getElementById('send-chat-btn').addEventListener('click', () => {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (message && socket) {
        socket.emit('chatMessage', { roomId: currentRoom.id, player: currentPlayer.name, message });
        input.value = '';
    }
});

document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('send-chat-btn').click();
    }
});

document.getElementById('roll-dice-btn').addEventListener('click', () => {
    const formula = document.getElementById('dice-formula').value.trim();
    if (formula && socket) {
        socket.emit('rollDice', { roomId: currentRoom.id, player: currentPlayer.name, formula });
    }
});

document.getElementById('leave-room-btn').addEventListener('click', () => {
    if (socket) socket.disconnect();
    currentRoom = null;
    currentPlayer = null;
    showScreen('main');
});

// Back buttons
document.getElementById('back-from-create').addEventListener('click', () => showScreen('main'));
document.getElementById('back-from-join').addEventListener('click', () => showScreen('main'));
document.getElementById('back-from-list').addEventListener('click', () => showScreen('main'));

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    showScreen('main');
});