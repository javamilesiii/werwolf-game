const Game = require('./models/Game');

class GameLogic {
    static ROLES = {
        WEREWOLF: 'werewolf',
        VILLAGER: 'villager',
        SEER: 'seer',
        GUARD: 'guard',
        MAYOR: 'mayor'
    };

    static assignRoles(players) {
        const playerCount = players.length;
        const roles = [];

        // Basic role distribution
        if (playerCount >= 4) {
            roles.push(this.ROLES.WEREWOLF);
            roles.push(this.ROLES.SEER);

            if (playerCount >= 6) {
                roles.push(this.ROLES.GUARD);
            }

            if (playerCount >= 8) {
                roles.push(this.ROLES.WEREWOLF); // Second werewolf
            }

            if (playerCount >= 10) {
                roles.push(this.ROLES.MAYOR);
            }
        }

        // Fill remaining slots with villagers
        while (roles.length < playerCount) {
            roles.push(this.ROLES.VILLAGER);
        }

        // Shuffle roles
        for (let i = roles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [roles[i], roles[j]] = [roles[j], roles[i]];
        }

        return roles;
    }

    static checkWinCondition(game) {
        const alivePlayers = game.players.filter(p => p.isAlive);
        const aliveWerewolves = alivePlayers.filter(p => p.role === this.ROLES.WEREWOLF);
        const aliveVillagers = alivePlayers.filter(p => p.role !== this.ROLES.WEREWOLF);

        if (aliveWerewolves.length === 0) {
            return 'villagers';
        }

        if (aliveWerewolves.length >= aliveVillagers.length) {
            return 'werewolves';
        }

        return null;
    }

    static calculateVotes(players) {
        const voteCounts = {};
        players.forEach(player => {
            if (player.votedFor) {
                voteCounts[player.votedFor] = (voteCounts[player.votedFor] || 0) + 1;
            }
        });

        let maxVotes = 0;
        let eliminatedPlayer = null;

        Object.entries(voteCounts).forEach(([playerId, votes]) => {
            if (votes > maxVotes) {
                maxVotes = votes;
                eliminatedPlayer = playerId;
            }
        });

        return {eliminatedPlayer, voteCounts};
    }
}

module.exports = GameLogic;