const Game = require('../models/Game');
const GameLogic = require('../gameLogic');

class GameManager {
    constructor(io) {
        this.io = io;
        this.games = new Map(); // In-memory cache for active games
    }

    async createGame(gameId, hostSocketId, hostName) {
        const game = new Game({
            gameId,
            players: [{
                socketId: hostSocketId,
                name: hostName,
                isHost: true
            }]
        });

        await game.save();
        this.games.set(gameId, game);
        return game;
    }

    async joinGame(gameId, socketId, playerName) {
        let game = this.games.get(gameId) || await Game.findOne({gameId});

        if (!game) {
            throw new Error('Game not found');
        }

        if (game.players.length >= game.settings.maxPlayers) {
            throw new Error('Game is full');
        }

        if (game.phase !== 'waiting') {
            throw new Error('Game has already started');
        }

        game.players.push({
            socketId,
            name: playerName
        });

        await game.save();
        this.games.set(gameId, game);

        return game;
    }

    async startGame(gameId) {
        const game = this.games.get(gameId);

        if (!game) {
            throw new Error('Game not found');
        }

        if (game.players.length < game.settings.minPlayers) {
            throw new Error('Not enough players');
        }

        // Assign roles
        const roles = GameLogic.assignRoles(game.players);
        game.players.forEach((player, index) => {
            player.role = roles[index];
        });

        game.phase = 'day';
        game.dayCount = 1;

        await game.save();
        this.games.set(gameId, game);

        return game;
    }

    async processVote(gameId, voterSocketId, targetSocketId) {
        const game = this.games.get(gameId);

        if (!game || game.phase !== 'voting') {
            throw new Error('Invalid voting phase');
        }

        const voter = game.players.find(p => p.socketId === voterSocketId);
        if (!voter || !voter.isAlive) {
            throw new Error('Invalid voter');
        }

        voter.votedFor = targetSocketId;
        voter.hasVoted = true;

        // Check if all alive players have voted
        const alivePlayers = game.players.filter(p => p.isAlive);
        const votedPlayers = alivePlayers.filter(p => p.hasVoted);

        if (votedPlayers.length === alivePlayers.length) {
            // Process elimination
            const {eliminatedPlayer} = GameLogic.calculateVotes(game.players);

            if (eliminatedPlayer) {
                const player = game.players.find(p => p.socketId === eliminatedPlayer);
                if (player) {
                    player.isAlive = false;
                }
            }

            // Reset votes
            game.players.forEach(p => {
                p.hasVoted = false;
                p.votedFor = null;
            });

            // Check win condition
            const winner = GameLogic.checkWinCondition(game);
            if (winner) {
                game.phase = 'ended';
            } else {
                game.phase = 'night';
            }
        }

        await game.save();
        this.games.set(gameId, game);

        return game;
    }
}

module.exports = GameManager;