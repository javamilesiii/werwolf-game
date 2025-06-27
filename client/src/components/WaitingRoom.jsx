import {useGame} from '../contexts/GameContext';
import {useState, useEffect} from 'react';

export default function WaitingRoom() {
    const {gameState, isHost, startGame, leaveGame, gameId, playerName, error} = useGame();
    const [notification, setNotification] = useState(null);

    // Show notification when we become host
    useEffect(() => {
        if (isHost && notification === null) {
            // Check if we just became host (not initial host)
            const wasInitialHost = gameState?.players?.length === 1;
            if (!wasInitialHost) {
                setNotification({
                    type: 'host-transfer',
                    message: '👑 You are now the host!'
                });

                // Clear notification after 5 seconds
                setTimeout(() => setNotification(null), 5000);
            }
        }
    }, [isHost, gameState?.players?.length]);

    const handleStartGame = () => {
        if (gameState?.players?.length >= gameState?.settings?.minPlayers) {
            startGame();
        }
    };

    const canStart = isHost && gameState?.players?.length >= (gameState?.settings?.minPlayers || 4);

    // Add some debugging
    console.log('WaitingRoom state:', {gameState, isHost, playerName, gameId});

    return (
        <div className="waiting-room">
            <div className="waiting-container">
                {/* Show any errors */}
                {error && (
                    <div className="error-message">
                        ❌ {error}
                    </div>
                )}

                {/* Show notifications */}
                {notification && (
                    <div className={`notification ${notification.type}`}>
                        {notification.message}
                    </div>
                )}

                <div className="game-header">
                    <h2>🎮 Game: {gameId}</h2>
                    <button onClick={leaveGame} className="leave-btn">
                        Leave Game
                    </button>
                </div>

                <div className="player-info">
                    <h3>You are: <span className="player-name">{playerName}</span></h3>
                    {isHost && <span className="host-badge">👑 Host</span>}
                </div>

                <div className="players-section">
                    <h3>
                        Players ({gameState?.players?.length || 0}/{gameState?.settings?.maxPlayers || 10})
                    </h3>

                    <div className="players-list">
                        {gameState?.players?.map((player, index) => (
                            <div key={player.socketId} className="player-item">
                                <span className="player-number">{index + 1}</span>
                                <span className="player-name">{player.name}</span>
                                {player.isHost && <span className="host-icon">👑</span>}
                            </div>
                        )) || (
                            <div className="no-players">
                                <p>Loading players...</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="game-settings">
                    <h4>Game Settings:</h4>
                    <div className="settings-grid">
                        <div>Min Players: {gameState?.settings?.minPlayers || 4}</div>
                        <div>Max Players: {gameState?.settings?.maxPlayers || 10}</div>
                    </div>
                </div>

                {isHost && (
                    <div className="host-controls">
                        <button
                            onClick={handleStartGame}
                            disabled={!canStart}
                            className={`start-btn ${canStart ? 'ready' : 'disabled'}`}
                        >
                            {canStart ? '🚀 Start Game' : `Need ${(gameState?.settings?.minPlayers || 4) - (gameState?.players?.length || 0)} more players`}
                        </button>
                    </div>
                )}

                <div className="waiting-message">
                    {isHost ?
                        "Waiting for you to start the game..." :
                        "Waiting for the host to start the game..."
                    }
                </div>
            </div>
        </div>
    );
}