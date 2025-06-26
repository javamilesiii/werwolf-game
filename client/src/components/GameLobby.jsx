import {useState} from 'react';
import {useGame} from '../contexts/GameContext';

export default function GameLobby() {
    const [gameId, setGameId] = useState('');
    const [playerName, setPlayerName] = useState('');
    const [mode, setMode] = useState('join'); // 'join' or 'create'

    const {createGame, joinGame, error, connected} = useGame();

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!gameId.trim() || !playerName.trim()) {
            return;
        }

        if (mode === 'create') {
            createGame(gameId.trim(), playerName.trim());
        } else {
            joinGame(gameId.trim(), playerName.trim());
        }
    };

    const generateGameId = () => {
        const id = Math.random().toString(36).substring(2, 8).toUpperCase();
        setGameId(id);
    };

    if (!connected) {
        return (
            <div className="lobby">
                <div className="connecting">
                    <h2>🔌 Connecting to server...</h2>
                </div>
            </div>
        );
    }

    return (
        <div className="lobby">
            <div className="lobby-container">
                <h1>🐺 Werewolf Game</h1>

                {error && (
                    <div className="error-message">
                        ❌ {error}
                    </div>
                )}

                <div className="mode-selector">
                    <button
                        className={mode === 'join' ? 'active' : ''}
                        onClick={() => setMode('join')}
                    >
                        Join Game
                    </button>
                    <button
                        className={mode === 'create' ? 'active' : ''}
                        onClick={() => setMode('create')}
                    >
                        Create Game
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label>
                            Your Name:
                            <input
                                type="text"
                                value={playerName}
                                onChange={(e) => setPlayerName(e.target.value)}
                                placeholder="Enter your name"
                                maxLength={20}
                                required
                            />
                        </label>
                    </div>

                    <div className="input-group">
                        <label>
                            Game ID:
                            <div className="game-id-input">
                                <input
                                    type="text"
                                    value={gameId}
                                    onChange={(e) => setGameId(e.target.value.toUpperCase())}
                                    placeholder="Enter game ID"
                                    maxLength={6}
                                    required
                                />
                                {mode === 'create' && (
                                    <button
                                        type="button"
                                        onClick={generateGameId}
                                        className="generate-btn"
                                    >
                                        Generate
                                    </button>
                                )}
                            </div>
                        </label>
                    </div>

                    <button type="submit" className="submit-btn">
                        {mode === 'create' ? '🎮 Create Game' : '🚪 Join Game'}
                    </button>
                </form>

                <div className="game-info">
                    <h3>How to Play:</h3>
                    <ul>
                        <li>🌙 Werewolves try to eliminate villagers at night</li>
                        <li>🌅 Villagers vote to eliminate suspected werewolves during the day</li>
                        <li>🔮 Special roles have unique abilities</li>
                        <li>🏆 Win by eliminating the opposing team</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}