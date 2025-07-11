const express = require('express');
const http = require('http');
const {Server} = require('socket.io');
const connectDB = require('./config/database');
const Game = require('./models/Game');

// Connect to database
connectDB();

const app = express();

// Add CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    next();
});

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

function sanitizeGameForClient(game) {
    return {
        gameId: game.gameId,
        phase: game.phase,
        dayCount: game.dayCount,
        winner: game.winner,
        settings: game.settings,
        currentNightRole: game.currentNightRole,
        players: game.players.map(p => ({
            socketId: p.socketId,
            name: p.name,
            isAlive: p.isAlive,
            isHost: p.isHost,
            hasVoted: p.hasVoted
        }))
    };
}

// Get night role message
function getNightRoleMessage(role) {
    const messages = {
        'werewolf': '🐺 Werewolves, choose your victim...',
        'seer': '🔮 Seer, choose someone to investigate...',
        'guard': '⚕️ Guard, choose someone to protect...',
        'witch': '🧙‍♀️ Witch, use your potions wisely...'
    };
    return messages[role] || `${role}'s turn...`;
}

// Check win conditions
function checkWinCondition(game) {
    const alivePlayers = game.players.filter(p => p.isAlive);
    const aliveWerewolves = alivePlayers.filter(p => p.role === 'werewolf');
    const aliveVillagers = alivePlayers.filter(p => p.role !== 'werewolf');

    if (aliveWerewolves.length === 0) {
        return 'villagers';
    }
    if (aliveWerewolves.length >= aliveVillagers.length) {
        return 'werewolves';
    }
    return null;
}

// Role assignment functions
function assignRoles(playerCount) {
    console.log(`🎭 Assigning roles for ${playerCount} players`);

    const roles = [];
    const werewolfCount = playerCount >= 7 ? 2 : 1;

    for (let i = 0; i < werewolfCount; i++) {
        roles.push('werewolf');
    }

    if (playerCount >= 4) roles.push('seer');
    if (playerCount >= 4) roles.push('guard');
    if (playerCount >= 4) roles.push('witch');
    if (playerCount >= 9) roles.push('mayor');

    while (roles.length < playerCount) {
        roles.push('villager');
    }

    console.log('🎭 Roles before shuffle:', roles);

    for (let i = roles.length - 1; i > 0; i--) {
        const randomBytes = require('crypto').randomBytes(4);
        const randomValue = randomBytes.readUInt32BE(0) / 0xFFFFFFFF;
        const j = Math.floor(randomValue * (i + 1));
        [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    console.log('🎭 Roles after shuffle:', roles);
    return roles;
}

function assignRolesWithHistory(players) {
    const playerCount = players.length;
    const baseRoles = assignRoles(playerCount);

    if (playerRoleHistory.size > 0) {
        const attempts = 10;

        for (let attempt = 0; attempt < attempts; attempt++) {
            const testRoles = [...baseRoles];

            for (let i = testRoles.length - 1; i > 0; i--) {
                const randomBytes = require('crypto').randomBytes(4);
                const randomValue = randomBytes.readUInt32BE(0) / 0xFFFFFFFF;
                const j = Math.floor(randomValue * (i + 1));
                [testRoles[i], testRoles[j]] = [testRoles[j], testRoles[i]];
            }

            let hasImmedateRepeat = false;
            for (let i = 0; i < players.length; i++) {
                const player = players[i];
                const assignedRole = testRoles[i];
                const history = playerRoleHistory.get(player.socketId) || [];

                if (history.length > 0 && history[history.length - 1] === assignedRole) {
                    if (assignedRole === 'werewolf') {
                        hasImmedateRepeat = true;
                        break;
                    }
                    if (history.length >= 2 && history[history.length - 2] === assignedRole) {
                        hasImmedateRepeat = true;
                        break;
                    }
                }
            }

            if (!hasImmedateRepeat) {
                console.log(`🎭 Found good role assignment on attempt ${attempt + 1}`);
                return testRoles;
            }
        }

        console.log('🎭 Could not avoid repeats, using random assignment');
    }

    return baseRoles;
}

function updatePlayerRoleHistory(players) {
    players.forEach(player => {
        if (!playerRoleHistory.has(player.socketId)) {
            playerRoleHistory.set(player.socketId, []);
        }

        const history = playerRoleHistory.get(player.socketId);
        history.push(player.role);

        if (history.length > 3) {
            history.shift();
        }

        console.log(`📊 Role history for ${player.name}: ${history.join(' -> ')}`);
    });
}

function cleanupPlayerHistory(socketId) {
    playerRoleHistory.delete(socketId);
    console.log(`🧹 Cleaned up role history for ${socketId}`);
}

// Night phase functions
async function checkNightPhaseProgress(gameId) {
    const game = activeGames.get(gameId);
    if (!game) return;

    const alivePlayers = game.players.filter(p => p.isAlive);
    const nightRoles = ['werewolf', 'seer', 'guard', 'witch'];

    const currentRole = game.currentNightRole || 'werewolf';
    const currentRoleIndex = nightRoles.indexOf(currentRole);

    console.log(`🌙 Checking night progress: ${currentRole} (index ${currentRoleIndex})`);

    const currentRolePlayers = alivePlayers.filter(p => p.role === currentRole);
    console.log(`🌙 Current role players:`, currentRolePlayers.map(p => p.name));

    if (currentRolePlayers.length === 0) {
        console.log(`🌙 No players of role ${currentRole}, moving to next`);
        await moveToNextNightRole(gameId, currentRoleIndex);
        return;
    }

    const confirmations = game.nightConfirmations || {};
    const confirmedPlayers = currentRolePlayers.filter(p => confirmations[p.socketId]);

    console.log(`🌙 Confirmations: ${confirmedPlayers.length}/${currentRolePlayers.length}`);

    const requiredConfirmations = currentRole === 'werewolf' ?
        Math.min(1, currentRolePlayers.length) :
        currentRolePlayers.length;

    console.log(`🌙 Required confirmations: ${requiredConfirmations}`);

    if (confirmedPlayers.length >= requiredConfirmations) {
        console.log(`🌙 All required confirmations received for ${currentRole}, moving to next role`);
        await moveToNextNightRole(gameId, currentRoleIndex);
    } else {
        console.log(`🌙 Still waiting for confirmations from ${currentRole}s`);
    }
}

// Add this function to handle witch's special needs
async function sendWitchDeathInfo(gameId) {
    const game = activeGames.get(gameId);
    if (!game) return;

    const nightActions = game.nightActions || {};
    const alivePlayers = game.players.filter(p => p.isAlive);
    const witches = alivePlayers.filter(p => p.role === 'witch');

    if (witches.length === 0) return;

    // Find who the werewolves are targeting
    const werewolfAction = Object.values(nightActions).find(action => action.action === 'kill');
    let deathTarget = null;

    if (werewolfAction) {
        const target = game.players.find(p => p.socketId === werewolfAction.targetSocketId);
        if (target) {
            deathTarget = {
                name: target.name,
                socketId: target.socketId
            };
        }
    }

    // Send death info to all witches with their potion status
    witches.forEach(witch => {
        io.to(witch.socketId).emit('witch-death-info', {
            deathTarget: deathTarget,
            message: deathTarget ?
                `${deathTarget.name} will die tonight unless you heal them.` :
                'No one is targeted for death tonight.',
            hasHealPotion: witch.potions?.heal !== false,
            hasPoisonPotion: witch.potions?.poison !== false,
            canHealTarget: deathTarget && witch.potions?.heal !== false
        });
    });
}

// Update moveToNextNightRole to send witch info when it's witch's turn
async function moveToNextNightRole(gameId, currentRoleIndex) {
    const game = activeGames.get(gameId);
    if (!game) return;

    const nightRoles = ['guard', 'seer', 'werewolf', 'witch'];
    const alivePlayers = game.players.filter(p => p.isAlive);

    let nextRoleIndex = currentRoleIndex + 1;
    let nextRole = null;

    while (nextRoleIndex < nightRoles.length) {
        const candidateRole = nightRoles[nextRoleIndex];
        const candidateRolePlayers = alivePlayers.filter(p => p.role === candidateRole);

        if (candidateRolePlayers.length > 0) {
            nextRole = candidateRole;
            break;
        }

        console.log(`🌙 No alive players for role ${candidateRole}, skipping`);
        nextRoleIndex++;
    }

    if (!nextRole) {
        console.log('🌙 All night roles completed, processing results');
        await processNightResults(gameId);
        return;
    }

    game.currentNightRole = nextRole;
    game.markModified('currentNightRole');

    await game.save();
    activeGames.set(gameId, game);

    // Special handling for witch - send death information
    if (nextRole === 'witch') {
        await sendWitchDeathInfo(gameId);
    }

    io.to(gameId).emit('night-role-turn', {
        currentRole: nextRole,
        message: getNightRoleMessage(nextRole),
        game: sanitizeGameForClient(game)
    });

    console.log(`🌙 Night phase: ${nextRole}'s turn`);
}

async function transitionToNight(gameId) {
    const game = activeGames.get(gameId);
    if (!game) return;

    game.phase = 'night';
    game.nightActions = {};
    game.nightConfirmations = {};

    const nightRoles = ['guard', 'seer', 'werewolf', 'witch'];
    const alivePlayers = game.players.filter(p => p.isAlive);

    let firstRole = 'werewolf';
    for (const role of nightRoles) {
        const rolePlayers = alivePlayers.filter(p => p.role === role);
        if (rolePlayers.length > 0) {
            firstRole = role;
            break;
        }
    }

    game.currentNightRole = firstRole;
    game.markModified('nightActions');
    game.markModified('nightConfirmations');
    game.markModified('currentNightRole');

    await game.save();
    activeGames.set(gameId, game);

    io.to(gameId).emit('night-phase-started', {
        game: sanitizeGameForClient(game),
        currentRole: firstRole,
        message: getNightRoleMessage(firstRole)
    });

    console.log(`🌙 Night phase started with ${firstRole}`);
}

async function checkNightActionsComplete(gameId) {
    const game = activeGames.get(gameId);
    if (!game) return;

    const alivePlayers = game.players.filter(p => p.isAlive);
    const werewolves = alivePlayers.filter(p => p.role === 'werewolf');
    const seers = alivePlayers.filter(p => p.role === 'seer');
    const guards = alivePlayers.filter(p => p.role === 'guard');

    const nightActions = game.nightActions || {};

    let requiredActions = 0;
    let completedActions = 0;

    // Werewolves need to kill (only one werewolf needs to act for the pack)
    if (werewolves.length > 0) {
        requiredActions++;
        const werewolfAction = Object.values(nightActions).find(action => action.role === 'werewolf');
        if (werewolfAction) completedActions++;
    }

    // Each alive seer needs to investigate
    seers.forEach(seer => {
        requiredActions++;
        if (nightActions[seer.socketId]) completedActions++;
    });

    // Each alive guard needs to protect
    guards.forEach(guard => {
        requiredActions++;
        if (nightActions[guard.socketId]) completedActions++;
    });

    console.log(`🌙 Night actions: ${completedActions}/${requiredActions} complete`);

    if (completedActions === requiredActions) {
        await processNightResults(gameId);
    }
}

// Update processNightResults function
async function processNightResults(gameId) {
    const game = activeGames.get(gameId);
    if (!game) return;

    const nightActions = game.nightActions || {};
    let killTarget = null;
    let protectedTarget = null;
    let poisonTarget = null;
    let healTarget = null;
    const seerResults = [];

    console.log('🌙 Processing night actions:', nightActions);

    // Process all night actions
    Object.entries(nightActions).forEach(([key, action]) => {
        console.log(`🔍 Processing action from ${key}:`, action);

        switch (action.action) {
            case 'kill':
                killTarget = action.targetSocketId;
                console.log(`🐺 Werewolf kill target: ${killTarget}`);
                break;
            case 'protect':
                protectedTarget = action.targetSocketId;
                console.log(`🛡️ Guard protect target: ${protectedTarget}`);
                break;
            case 'investigate':
                const target = game.players.find(p => p.socketId === action.targetSocketId);
                seerResults.push({
                    seerSocketId: key,
                    targetName: target?.name,
                    targetRole: target?.role,
                    isWerewolf: target?.role === 'werewolf'
                });
                console.log(`🔮 Seer investigation: ${target?.name} is ${target?.role}`);
                break;
            case 'poison':
                poisonTarget = action.targetSocketId;
                console.log(`☠️ Witch poison target: ${poisonTarget}`);
                break;
            case 'heal':
                healTarget = action.targetSocketId;
                console.log(`🧪 Witch heal target: ${healTarget}`);
                break;
        }
    });

    // Process deaths and saves
    let killedPlayers = [];
    let protectionEvents = [];

    // Check werewolf kill
    if (killTarget) {
        const victim = game.players.find(p => p.socketId === killTarget);
        let saved = false;
        let saveReason = '';

        if (killTarget === protectedTarget) {
            saved = true;
            saveReason = 'protected by guard';
            protectionEvents.push(`🛡️ ${victim.name} was protected by the guard`);
        } else if (killTarget === healTarget) {
            saved = true;
            saveReason = 'healed by witch';
            protectionEvents.push(`🧪 ${victim.name} was saved by the witch`);
        }

        if (!saved && victim) {
            victim.isAlive = false;
            killedPlayers.push({
                name: victim.name,
                role: victim.role,
                cause: 'werewolf'
            });
            console.log(`💀 ${victim.name} was killed by werewolves`);
        } else {
            console.log(`✨ ${victim.name} was saved (${saveReason})`);
        }
    }

    // Check witch poison (separate from werewolf kill)
    if (poisonTarget) {
        const poisonVictim = game.players.find(p => p.socketId === poisonTarget);
        if (poisonVictim && poisonVictim.isAlive) {
            poisonVictim.isAlive = false;
            killedPlayers.push({
                name: poisonVictim.name,
                role: poisonVictim.role,
                cause: 'poison'
            });
            console.log(`☠️ ${poisonVictim.name} was poisoned by witch`);
        }
    }

    // Send seer results privately
    seerResults.forEach(result => {
        if (result.seerSocketId) {
            // Extract actual socket ID if it's a compound key
            const seerSocketId = result.seerSocketId.includes('_') ?
                result.seerSocketId.split('_')[0] : result.seerSocketId;

            console.log(`🔮 Sending seer result to ${seerSocketId}:`, result);
            io.to(seerSocketId).emit('seer-result', {
                targetName: result.targetName,
                targetRole: result.targetRole,
                isWerewolf: result.isWerewolf
            });
        }
    });

    // Clear night actions and move to day
    game.nightActions = {};
    game.nightConfirmations = {};
    game.currentNightRole = null;
    game.phase = 'day';
    game.dayCount++;

    await game.save();
    activeGames.set(gameId, game);

    // Send night results
    const nightResultsData = {
        game: sanitizeGameForClient(game),
        nightResults: {
            killedPlayers: killedPlayers,
            protectionEvents: protectionEvents,
            multipleDeaths: killedPlayers.length > 1
        }
    };

    io.to(gameId).emit('day-phase-started', nightResultsData);

    // Check win condition
    const winner = checkWinCondition(game);
    if (winner) {
        setTimeout(async () => {
            game.phase = 'ended';
            game.winner = winner;
            await game.save();
            activeGames.set(gameId, game);

            io.to(gameId).emit('game-ended', {
                winner,
                game: sanitizeGameForClient(game),
                allPlayerRoles: game.players.map(p => ({
                    name: p.name,
                    role: p.role,
                    isAlive: p.isAlive
                }))
            });
        }, 5000);
        return;
    }

    setTimeout(() => {
        transitionToVoting(gameId);
    }, 30000);
}

async function transitionToVoting(gameId) {
    const game = activeGames.get(gameId);
    if (!game || game.phase !== 'day') return;

    game.phase = 'voting';

    // Reset voting data
    game.players.forEach(player => {
        player.hasVoted = false;
        player.votedFor = null;
    });

    await game.save();
    activeGames.set(gameId, game);

    io.to(gameId).emit('voting-phase-started', {
        game: sanitizeGameForClient(game)
    });
}

// Process voting results
async function processVotingResults(gameId) {
    const game = activeGames.get(gameId);
    if (!game) return;

    // Count votes
    const voteCounts = {};
    game.players.forEach(player => {
        if (player.votedFor && player.isAlive) {
            voteCounts[player.votedFor] = (voteCounts[player.votedFor] || 0) + 1;
        }
    });

    // Find player with most votes
    let maxVotes = 0;
    let eliminatedPlayerSocketId = null;
    let tie = false;

    Object.entries(voteCounts).forEach(([socketId, votes]) => {
        if (votes > maxVotes) {
            maxVotes = votes;
            eliminatedPlayerSocketId = socketId;
            tie = false;
        } else if (votes === maxVotes && votes > 0) {
            tie = true;
        }
    });

    let eliminatedPlayer = null;
    if (!tie && eliminatedPlayerSocketId) {
        eliminatedPlayer = game.players.find(p => p.socketId === eliminatedPlayerSocketId);
        if (eliminatedPlayer) {
            eliminatedPlayer.isAlive = false;
        }
    }

    // Reset voting data
    game.players.forEach(player => {
        player.hasVoted = false;
        player.votedFor = null;
    });

    await game.save();
    activeGames.set(gameId, game);

    // Send voting results with role reveal
    const votingResultsData = {
        eliminatedPlayer: eliminatedPlayer ? {
            name: eliminatedPlayer.name,
            role: eliminatedPlayer.role  // REVEAL ROLE
        } : null,
        wasTie: tie,
        voteCounts: Object.entries(voteCounts).map(([socketId, votes]) => ({
            playerName: game.players.find(p => p.socketId === socketId)?.name,
            votes
        })),
        game: sanitizeGameForClient(game)
    };

    io.to(gameId).emit('voting-results', votingResultsData);

    // Check win condition after revealing role
    const winner = checkWinCondition(game);
    if (winner) {
        // Wait 5 seconds before showing game end
        setTimeout(async () => {
            game.phase = 'ended';
            game.winner = winner;
            await game.save();
            activeGames.set(gameId, game);

            io.to(gameId).emit('game-ended', {
                winner,
                game: sanitizeGameForClient(game),
                allPlayerRoles: game.players.map(p => ({
                    name: p.name,
                    role: p.role,
                    isAlive: p.isAlive
                }))
            });
        }, 5000); // 5 second delay
        return;
    }

    // Transition to night after 10 seconds if game continues
    setTimeout(() => {
        transitionToNight(gameId);
    }, 10000);
}

function getActionMessage(action, targetName) {
    const messages = {
        'kill': `You chose to kill ${targetName}`,
        'investigate': `You chose to investigate ${targetName}`,
        'protect': `You chose to protect ${targetName}`,
        'heal': `You chose to heal ${targetName}`,
        'poison': `You chose to poison ${targetName}`
    };
    return messages[action] || `You chose to ${action} ${targetName}`;
}

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
        console.log(`🔄 Join game request:`, data); // ADD THIS
        try {
            const {gameId, playerName} = data;

            let game = activeGames.get(gameId) || await Game.findOne({gameId});
            console.log(`📊 Game found:`, game ? 'Yes' : 'No'); // ADD THIS

            if (!game) {
                console.log(`❌ Game not found: ${gameId}`); // ADD THIS
                socket.emit('error', {message: 'Game not found'});
                return;
            }

            if (game.players.length >= game.settings.maxPlayers) {
                console.log(`❌ Game is full: ${gameId}`); // ADD THIS
                socket.emit('error', {message: 'Game is full'});
                return;
            }

            if (game.phase !== 'waiting') {
                console.log(`❌ Game already started: ${gameId}`); // ADD THIS
                socket.emit('error', {message: 'Game has already started'});
                return;
            }

            // Check if player name already exists
            if (game.players.some(p => p.name === playerName)) {
                console.log(`❌ Name taken: ${playerName}`); // ADD THIS
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
            console.log(`✅ Player ${playerName} joined room ${gameId}`); // ADD THIS

            // Emit to ALL players in the room (including the new player)
            io.to(gameId).emit('player-joined', {game});

            console.log(`👤 ${playerName} joined game: ${gameId} (${game.players.length} players total)`);
        } catch (error) {
            console.error('Error joining game:', error);
            socket.emit('error', {message: 'Failed to join game'});
        }
    });

// Handle night actions (werewolf kills, seer investigations, guard heals)
    socket.on('night-action', async (data) => {
        try {
            const {gameId, action, targetSocketId} = data;
            let game = activeGames.get(gameId) || await Game.findOne({gameId});

            if (!game || game.phase !== 'night') {
                socket.emit('error', {message: 'Invalid action or game phase'});
                return;
            }

            const player = game.players.find(p => p.socketId === socket.id);
            if (!player || !player.isAlive) {
                socket.emit('error', {message: 'Dead players cannot perform night actions'});
                return;
            }

            if (player.role !== game.currentNightRole) {
                socket.emit('error', {message: 'Not your turn'});
                return;
            }

            if (action === 'skip') {
                console.log(`🌙 ${player.name} (${player.role}) skipped their turn`);
                socket.emit('night-action-submitted', {
                    message: 'You chose to skip your turn',
                    action: 'skip',
                    targetName: null,
                    targetRole: null
                });
                return;
            }

            // Special handling for witch actions
            if (player.role === 'witch') {
                if (action === 'heal') {
                    // Check if witch has healing potion
                    if (player.potions?.heal === false) {
                        socket.emit('error', {message: 'You have already used your healing potion'});
                        return;
                    }

                    // For healing, can only heal the werewolf victim
                    const nightActions = game.nightActions || {};
                    const werewolfAction = Object.values(nightActions).find(a => a.action === 'kill');

                    if (!werewolfAction || werewolfAction.targetSocketId !== targetSocketId) {
                        socket.emit('error', {message: 'You can only heal the werewolf victim'});
                        return;
                    }

                    // Mark healing potion as used
                    player.potions.heal = false;
                } else if (action === 'poison') {
                    // Check if witch has poison potion
                    if (player.potions?.poison === false) {
                        socket.emit('error', {message: 'You have already used your poison potion'});
                        return;
                    }

                    // Mark poison potion as used
                    player.potions.poison = false;
                }
            }

            if (targetSocketId === socket.id && action !== 'heal') {
                socket.emit('error', {message: 'You cannot target yourself'});
                return;
            }

            const target = game.players.find(p => p.socketId === targetSocketId);
            if (!target || !target.isAlive) {
                socket.emit('error', {message: 'Cannot target dead players'});
                return;
            }

            const validActions = {
                'werewolf': ['kill'],
                'seer': ['investigate'],
                'guard': ['protect'],
                'witch': ['heal', 'poison']
            };

            if (!validActions[player.role]?.includes(action)) {
                socket.emit('error', {message: 'Invalid action for your role'});
                return;
            }

            if (!game.nightActions) {
                game.nightActions = {};
            }

            // For witch, we need to handle multiple actions in the same night
            if (player.role === 'witch') {
                // Create a unique key for each witch action
                const actionKey = `${socket.id}_${action}`;
                game.nightActions[actionKey] = {action, targetSocketId, role: player.role};
            } else {
                game.nightActions[socket.id] = {action, targetSocketId, role: player.role};
            }

            console.log(`🌙 Night action: ${player.name} (${player.role}) -> ${action} -> ${target.name}`);

            await game.save();
            activeGames.set(gameId, game);

            // Send detailed action confirmation
            let actionResponse = {
                message: getActionMessage(action, target.name),
                action: action,
                targetName: target.name,
                targetRole: player.role === 'seer' ? target.role : null
            };

            // Add potion status for witch
            if (player.role === 'witch') {
                actionResponse.remainingPotions = {
                    heal: player.potions?.heal !== false,
                    poison: player.potions?.poison !== false
                };
            }

            socket.emit('night-action-submitted', actionResponse);

        } catch (error) {
            console.error('Error processing night action:', error);
            socket.emit('error', {message: 'Failed to process night action'});
        }
    });
// Handle day phase voting
    socket.on('vote', async (data) => {
        try {
            const {gameId, targetSocketId} = data;
            let game = activeGames.get(gameId) || await Game.findOne({gameId});

            if (!game || game.phase !== 'voting') {
                socket.emit('error', {message: 'Not in voting phase'});
                return;
            }

            const voter = game.players.find(p => p.socketId === socket.id);
            if (!voter || !voter.isAlive) {  // ADD THIS CHECK
                socket.emit('error', {message: 'Dead players cannot vote'});
                return;
            }

            // Check if voting for themselves
            if (targetSocketId === socket.id) {  // ADD THIS CHECK
                socket.emit('error', {message: 'You cannot vote for yourself'});
                return;
            }

            // Check if target is alive
            const target = game.players.find(p => p.socketId === targetSocketId);
            if (!target || !target.isAlive) {  // ADD THIS CHECK
                socket.emit('error', {message: 'Cannot vote for dead players'});
                return;
            }

            // Record the vote
            voter.votedFor = targetSocketId;
            voter.hasVoted = true;

            await game.save();
            activeGames.set(gameId, game);

            // Notify all players about vote count (without revealing who voted for whom)
            const alivePlayers = game.players.filter(p => p.isAlive);
            const votedPlayers = alivePlayers.filter(p => p.hasVoted);

            io.to(gameId).emit('vote-update', {
                votedCount: votedPlayers.length,
                totalCount: alivePlayers.length
            });

            console.log(`🗳️ Vote: ${voter.name} voted for ${target.name} (${votedPlayers.length}/${alivePlayers.length})`);

            // Check if all alive players have voted
            if (votedPlayers.length === alivePlayers.length) {
                await processVotingResults(gameId);
            }

        } catch (error) {
            console.error('Error processing vote:', error);
            socket.emit('error', {message: 'Failed to process vote'});
        }
    });


    socket.on('start-game', async (data) => {
        try {
            const {gameId} = data;
            let game = activeGames.get(gameId) || await Game.findOne({gameId});

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

            // Use the new role assignment with history
            const roles = assignRolesWithHistory ? assignRolesWithHistory(game.players) : assignRoles(game.players.length);
            game.players.forEach((player, index) => {
                player.role = roles[index];

                // Initialize witch potions
                if (player.role === 'witch') {
                    player.potions = {
                        heal: true,    // Has healing potion
                        poison: true   // Has poison potion
                    };
                } else {
                    // Ensure other roles don't have potion properties
                    player.potions = undefined;
                }
            });

            // Update role history
            if (updatePlayerRoleHistory) {
                updatePlayerRoleHistory(game.players);
            }

            game.phase = 'night';
            game.dayCount = 1;
            game.nightActions = {};
            game.nightConfirmations = {};
            game.currentNightRole = 'werewolf';

            // Mark the potions field as modified for MongoDB
            game.markModified('players');

            await game.save();
            activeGames.set(gameId, game);

            // Send role information privately to each player
            game.players.forEach(player => {
                io.to(player.socketId).emit('role-assigned', {
                    role: player.role,
                    gameState: sanitizeGameForClient(game)
                });
            });

            // Start the game with night phase
            io.to(gameId).emit('game-started', {
                game: sanitizeGameForClient(game),
                currentRole: 'werewolf',
                nightRoleMessage: '🐺 Werewolves, choose your victim...'
            });

            console.log(`🚀 Game started: ${gameId} - Night phase begins with werewolves`);

            // Log role distribution for debugging
            const roleCount = {};
            game.players.forEach(p => {
                roleCount[p.role] = (roleCount[p.role] || 0) + 1;
            });
            console.log('🎭 Role distribution:', roleCount);

        } catch (error) {
            console.error('Error starting game:', error);
            socket.emit('error', {message: 'Failed to start game'});
        }
    });

    socket.on('return-to-lobby', async (data) => {
        try {
            const {gameId} = data;
            let game = activeGames.get(gameId) || await Game.findOne({gameId});

            if (!game) {
                socket.emit('error', {message: 'Game not found'});
                return;
            }

            const player = game.players.find(p => p.socketId === socket.id);
            if (!player?.isHost) {
                socket.emit('error', {message: 'Only the host can restart the game'});
                return;
            }

            // Reset game to waiting state - PROPERLY RESET EVERYTHING
            game.phase = 'waiting';
            game.dayCount = 0;
            game.winner = undefined;
            game.nightActions = {};

            // Reset all players completely
            game.players.forEach(player => {
                player.role = undefined;
                player.isAlive = true;
                player.votes = 0;
                player.hasVoted = false;
                player.votedFor = undefined;
                // Reset witch potions
                player.potions = undefined;
                // Keep socketId, name, isHost - these should remain
            });

            // Mark as modified for Mongoose
            game.markModified('players');
            game.markModified('nightActions');

            await game.save();
            activeGames.set(gameId, game);

            // Send all players back to waiting room
            io.to(gameId).emit('returned-to-lobby', {
                game: sanitizeGameForClient(game)
            });

            console.log(`🔄 Game ${gameId} returned to lobby with ${game.players.length} players`);
        } catch (error) {
            console.error('Error returning to lobby:', error);
            socket.emit('error', {message: 'Failed to return to lobby'});
        }
    });
    socket.on('night-action-confirm', async (data) => {
        console.log('📝 Received night-action-confirm:', data);

        try {
            const {gameId} = data;

            if (!gameId) {
                console.error('❌ No gameId provided in night-action-confirm');
                socket.emit('error', {message: 'No game ID provided'});
                return;
            }

            let game = activeGames.get(gameId) || await Game.findOne({gameId});

            if (!game) {
                console.error('❌ Game not found:', gameId);
                socket.emit('error', {message: 'Game not found'});
                return;
            }

            if (game.phase !== 'night') {
                console.error('❌ Not in night phase:', game.phase);
                socket.emit('error', {message: 'Invalid phase'});
                return;
            }

            const player = game.players.find(p => p.socketId === socket.id);
            if (!player) {
                console.error('❌ Player not found in game:', socket.id);
                socket.emit('error', {message: 'Player not found'});
                return;
            }

            if (!player.isAlive) {
                console.error('❌ Dead player trying to confirm:', player.name);
                socket.emit('error', {message: 'Dead players cannot act'});
                return;
            }

            // Check if it's actually this player's role's turn
            if (player.role !== game.currentNightRole) {
                console.error('❌ Wrong role turn:', player.role, 'vs', game.currentNightRole);
                socket.emit('error', {message: `Not your turn (current: ${game.currentNightRole}, yours: ${player.role})`});
                return;
            }

            // Mark this player as having confirmed their night action
            if (!game.nightConfirmations) {
                game.nightConfirmations = {};
            }
            game.nightConfirmations[socket.id] = true;

            // Mark as modified for MongoDB
            game.markModified('nightConfirmations');

            await game.save();
            activeGames.set(gameId, game);

            console.log(`✅ ${player.name} (${player.role}) confirmed their night action`);

            // Send confirmation to the player
            socket.emit('night-action-confirmed', {
                message: 'Your action has been confirmed'
            });

            // Check if we can proceed to next role or finish night
            await checkNightPhaseProgress(gameId);

        } catch (error) {
            console.error('Error confirming night action:', error);
            socket.emit('error', {message: 'Failed to confirm action: ' + error.message});
        }
    });

    socket.on('leave-game', async (data) => {
        try {
            const {gameId} = data;
            console.log(`🚪 Player ${socket.id} leaving game ${gameId}`);

            let game = activeGames.get(gameId) || await Game.findOne({gameId});

            if (!game) {
                console.log(`❌ Game ${gameId} not found for leave`);
                socket.emit('error', {message: 'Game not found'});
                return;
            }

            const playerIndex = game.players.findIndex(p => p.socketId === socket.id);
            if (playerIndex === -1) {
                console.log(`❌ Player ${socket.id} not found in game ${gameId}`);
                socket.emit('error', {message: 'Player not found in game'});
                return;
            }

            const leavingPlayer = game.players[playerIndex];
            const wasHost = leavingPlayer.isHost;

            console.log(`👤 ${leavingPlayer.name} (host: ${wasHost}) leaving game ${gameId}`);

            // Remove player from game
            game.players.splice(playerIndex, 1);

            // Remove player from socket room
            socket.leave(gameId);

            // If the game is now empty, delete it
            if (game.players.length === 0) {
                console.log(`🗑️ Game ${gameId} has no players left, deleting`);
                activeGames.delete(gameId);
                await Game.findOneAndDelete({gameId});
                return;
            }

            // If the host left, assign a new host
            if (wasHost && game.players.length > 0) {
                game.players[0].isHost = true;
                console.log(`👑 New host assigned: ${game.players[0].name}`);
            }

            // Save updated game state
            await game.save();
            activeGames.set(gameId, game);

            // Notify remaining players about the updated game state
            io.to(gameId).emit('player-left', {
                leftPlayerName: leavingPlayer.name,
                game: sanitizeGameForClient(game),
                newHost: wasHost ? game.players[0]?.name : null
            });

            console.log(`✅ ${leavingPlayer.name} successfully left game ${gameId}. Remaining players: ${game.players.length}`);

        } catch (error) {
            console.error('Error handling leave game:', error);
            socket.emit('error', {message: 'Failed to leave game'});
        }
    });

    socket.on('disconnect', async () => {
        console.log('❌ User disconnected:', socket.id);

        try {
            // Find which game this player was in
            for (const [gameId, game] of activeGames.entries()) {
                const playerIndex = game.players.findIndex(p => p.socketId === socket.id);

                if (playerIndex !== -1) {
                    const disconnectedPlayer = game.players[playerIndex];
                    const wasHost = disconnectedPlayer.isHost;

                    console.log(`👤 Player ${disconnectedPlayer.name} disconnected from game ${gameId}`);

                    // Remove player from game
                    game.players.splice(playerIndex, 1);

                    // If the game is now empty, delete it
                    if (game.players.length === 0) {
                        console.log(`🗑️ Game ${gameId} has no players left, deleting`);
                        activeGames.delete(gameId);
                        await Game.findOneAndDelete({gameId});
                        break;
                    }

                    // If the host disconnected, assign a new host
                    if (wasHost && game.players.length > 0) {
                        game.players[0].isHost = true;
                        console.log(`👑 New host assigned: ${game.players[0].name}`);
                    }

                    // Save updated game state
                    await game.save();
                    activeGames.set(gameId, game);

                    // Notify remaining players
                    io.to(gameId).emit('player-disconnected', {
                        disconnectedPlayerName: disconnectedPlayer.name,
                        game: sanitizeGameForClient(game),
                        newHost: wasHost ? game.players[0]?.name : null
                    });

                    console.log(`✅ Handled disconnect for ${disconnectedPlayer.name}. Remaining players: ${game.players.length}`);
                    break;
                }
            }

            // Clean up player role history
            if (typeof cleanupPlayerHistory === 'function') {
                cleanupPlayerHistory(socket.id);
            }

        } catch (error) {
            console.error('Error handling disconnect:', error);
        }
    });
});

// Store recent role history to avoid immediate repeats
const playerRoleHistory = new Map(); // socketId -> [recent roles]


const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});