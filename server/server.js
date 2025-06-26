const express = require('express');
const http = require('http');
const {Server} = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/database');
const Game = require('./models/Game');

// Connect to database
connectDB();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// Store active games in memory for quick access
const activeGames = new Map();

app.get('/', (req, res) => {
    res.send('🧙‍♂️ Werewolf Game Server is running!');
});

io.on('connection', (socket) => {
    console.log('✅ A user connected:', socket.id);

    socket.emit('welcome', {message: 'Welcome to Werewolf Game!'});

    socket.on('create-game', async (data) => {
        try {
            const {gameId, playerName} = data;

            // Check if game already exists
            const existingGame = await Game.findOne({gameId});
            if (existingGame) {
                socket.emit('error', {message: 'Game ID already exists'});
                return;
            }

            // Create new game
            const game = new Game({
                gameId,
                players: [{
                    socketId: socket.id,
                    name: playerName,
                    isHost: true
                }]
            });

            await game.save();
            activeGames.set(gameId, game);

            socket.join(gameId);
            socket.emit('game-created', {game});

            console.log(`🎮 Game created: ${gameId} by ${playerName}`);
        } catch (error) {
            console.error('Error creating game:', error);
            socket.emit('error', {message: 'Failed to create game'});
        }
    });

    socket.on('join-game', async (data) => {
        try {
            const {gameId, playerName} = data;

            let game = activeGames.get(gameId) || await Game.findOne({gameId});

            if (!game) {
                socket.emit('error', {message: 'Game not found'});
                return;
            }

            if (game.players.length >= game.settings.maxPlayers) {
                socket.emit('error', {message: 'Game is full'});
                return;
            }

            if (game.phase !== 'waiting') {
                socket.emit('error', {message: 'Game has already started'});
                return;
            }

            // Check if player name already exists
            if (game.players.some(p => p.name === playerName)) {
                socket.emit('error', {message: 'Player name already taken'});
                return;
            }

            // Add player to game
            game.players.push({
                socketId: socket.id,
                name: playerName
            });

            await game.save();
            activeGames.set(gameId, game);

            socket.join(gameId);
            io.to(gameId).emit('player-joined', {game});

            console.log(`👤 ${playerName} joined game: ${gameId}`);
        } catch (error) {
            console.error('Error joining game:', error);
            socket.emit('error', {message: 'Failed to join game'});
        }
    });

    socket.on('start-game', async (data) => {
        try {
            const {gameId} = data;
            const game = activeGames.get(gameId) || await Game.findOne({gameId});

            if (!game) {
                socket.emit('error', {message: 'Game not found'});
                return;
            }

            const player = game.players.find(p => p.socketId === socket.id);
            if (!player?.isHost) {
                socket.emit('error', {message: 'Only the host can start the game'});
                return;
            }

            if (game.players.length < game.settings.minPlayers) {
                socket.emit('error', {message: `Need at least ${game.settings.minPlayers} players`});
                return;
            }

            // Simple role assignment for now
            const roles = assignRoles(game.players.length);
            game.players.forEach((player, index) => {
                player.role = roles[index];
            });

            game.phase = 'day';
            game.dayCount = 1;

            await game.save();
            activeGames.set(gameId, game);

            // Send role information privately to each player
            game.players.forEach(player => {
                io.to(player.socketId).emit('role-assigned', {
                    role: player.role,
                    gameState: {
                        phase: game.phase,
                        dayCount: game.dayCount,
                        players: game.players.map(p => ({
                            name: p.name,
                            isAlive: p.isAlive,
                            socketId: p.socketId
                        }))
                    }
                });
            });

            io.to(gameId).emit('game-started', {game});
            console.log(`🚀 Game started: ${gameId}`);
        } catch (error) {
            console.error('Error starting game:', error);
            socket.emit('error', {message: 'Failed to start game'});
        }
    });

    socket.on('disconnect', () => {
        console.log('❌ User disconnected:', socket.id);
        // TODO: Handle player disconnection
    });
});

// Simple role assignment function
function assignRoles(playerCount) {
    const roles = [];

    // Add werewolves (1 for 4-6 players, 2 for 7+ players)
    const werewolfCount = playerCount >= 7 ? 2 : 1;
    for (let i = 0; i < werewolfCount; i++) {
        roles.push('werewolf');
    }

    // Add special roles
    if (playerCount >= 5) roles.push('seer');
    if (playerCount >= 6) roles.push('doctor');

    // Fill rest with villagers
    while (roles.length < playerCount) {
        roles.push('villager');
    }

    // Shuffle roles
    for (let i = roles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    return roles;
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});