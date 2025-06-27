const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
    socketId: String,
    name: String,
    role: {type: String, default: null},
    isAlive: {type: Boolean, default: true},
    votes: {type: Number, default: 0},
    hasVoted: {type: Boolean, default: false},
    votedFor: String,
    isHost: {type: Boolean, default: false},
    // ADD WITCH POTION TRACKING
    potions: {
        heal: {type: Boolean, default: true},    // Has healing potion
        poison: {type: Boolean, default: true}   // Has poison potion
    }
});

const gameSchema = new mongoose.Schema({
    gameId: {type: String, unique: true, required: true},
    players: [playerSchema],
    phase: {
        type: String,
        enum: ['waiting', 'day', 'voting', 'night', 'ended'],
        default: 'waiting'
    },
    dayCount: {type: Number, default: 0},
    settings: {
        maxPlayers: {type: Number, default: 10},
        minPlayers: {type: Number, default: 4},
        avoidRoleRepeats: {type: Boolean, default: true}  // ADD THIS
    },
    nightActions: {type: mongoose.Schema.Types.Mixed, default: {}},
    winner: String,
    createdAt: {type: Date, default: Date.now},
    lastActivity: {type: Date, default: Date.now}
});

module.exports = mongoose.model('Game', gameSchema);