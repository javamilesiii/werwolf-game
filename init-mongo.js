db = db.getSiblingDB('werewolf-game');

db.createUser({
    user: 'gameuser',
    pwd: 'gamepassword',
    roles: [
        {
            role: 'readWrite',
            db: 'werewolf-game'
        }
    ]
});

// Create initial collections
db.createCollection('games');
db.createCollection('players');