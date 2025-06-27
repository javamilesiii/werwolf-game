import {useGame} from '../contexts/GameContext';
import {useState, useEffect} from 'react';
import {io} from 'socket.io-client';

export default function GamePhase() {
    const {
        gameState,
        role,
        playerName,
        nightResults,
        votingResults,
        voteCount,
        seerResult,
        error,
        winner,
        allPlayerRoles,
        returnToLobby,
        isHost,
        currentNightRole,
        nightRoleMessage,
        nightActionInfo,     // ADD THIS
        witchDeathInfo       // ADD THIS
    } = useGame();

    // Get current player info
    const currentPlayer = gameState?.players?.find(p => p.name === playerName);

    if (!gameState || !role || !currentPlayer) {
        return (
            <div className="game-phase">
                <div className="loading">
                    <h2>🎭 Receiving your role...</h2>
                </div>
            </div>
        );
    }

    return (
        <div className="game-phase">
            <div className="game-container">
                {/* Game Header */}
                <div className="game-header">
                    <h2>🌙 Day {gameState.dayCount}</h2>
                    <div className="phase-indicator">
                        Phase: <span className="phase-name">{gameState.phase}</span>
                    </div>
                </div>

                {/* Show Night Results */}
                {nightResults && gameState.phase === 'day' && (
                    <div className="night-results">
                        <h3>🌅 Morning News</h3>
                        {nightResults.killedPlayer ? (
                            <p className="death-announcement">
                                💀 <strong>{nightResults.killedPlayer}</strong> was found dead this morning!
                                {nightResults.wasProtected && " (But they were protected!)"}
                            </p>
                        ) : (
                            <p className="no-death">🙏 Everyone survived the night!</p>
                        )}
                    </div>
                )}

                {/* Show Voting Results */}
                {votingResults && (
                    <div className="voting-results">
                        <h3>📊 Voting Results</h3>
                        {votingResults.eliminatedPlayer ? (
                            <p>🔥 <strong>{votingResults.eliminatedPlayer}</strong> was eliminated by vote!</p>
                        ) : (
                            <p>🤝 The vote was a tie - no one was eliminated!</p>
                        )}
                    </div>
                )}

                {/* Show Seer Results */}
                {seerResult && (
                    <div className="seer-results">
                        <h3>🔮 Your Investigation</h3>
                        <div className="investigation-result">
                            <p><strong>{seerResult.targetName}</strong></p>
                            <p className={`role-reveal role-${seerResult.targetRole}`}>
                                🎭 Role: <strong>{getRoleIcon(seerResult.targetRole)} {seerResult.targetRole}</strong>
                            </p>
                            <p>
                                {seerResult.isWerewolf ? '🐺 This person IS a werewolf!' : '👨‍🌾 This person is NOT a werewolf.'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Player Info */}
                <div className="player-info">
                    <h3>You are: <span className="player-name">{playerName}</span></h3>
                    <div className="role-card">
                        <span className="role-icon">{getRoleIcon(role)}</span>
                        <span className="role-name">You are a {role}</span>
                        <p className="role-description">{getRoleDescription(role)}</p>
                    </div>
                </div>

                {/* Players List */}
                <div className="players-section">
                    <h3>Players ({getAlivePlayers(gameState.players).length} alive)</h3>
                    <div className="players-grid">
                        {gameState.players.map((player) => (
                            <div
                                key={player.socketId}
                                className={`player-card ${!player.isAlive ? 'dead' : ''}`}
                            >
                                <div className="player-avatar">
                                    {player.isAlive ? '😀' : '💀'}
                                </div>
                                <div className="player-details">
                                    <span className="player-name">{player.name}</span>
                                    <span className="player-status">
                                        {player.isAlive ? 'Alive' : 'Dead'}
                                    </span>
                                </div>
                                {player.isHost && <span className="host-icon">👑</span>}
                                {gameState.phase === 'voting' && player.hasVoted && player.isAlive && (
                                    <span className="voted-icon">✅</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Game Phase Content */}
                <div className="phase-content">
                    {renderPhaseContent(gameState, role, voteCount, currentPlayer)}
                </div>
            </div>
        </div>
    );
}

// Helper functions (same as before)
function getRoleIcon(role) {
    const icons = {
        'werewolf': '🐺',
        'villager': '👨‍🌾',
        'seer': '🔮',
        'doctor': '⚕️',
        'mayor': '🎖️'
    };
    return icons[role] || '❓';
}

function getRoleDescription(role) {
    const descriptions = {
        'werewolf': 'Eliminate villagers during the night. Win when werewolves equal or outnumber villagers.',
        'villager': 'Find and eliminate the werewolves. Vote during the day to eliminate suspects.',
        'seer': 'Each night, investigate one player to learn if they are a werewolf.',
        'doctor': 'Each night, protect one player from werewolf attacks.',
        'mayor': 'Your vote counts double during the day phase.'
    };
    return descriptions[role] || 'Unknown role';
}

function getAlivePlayers(players) {
    return players.filter(p => p.isAlive);
}

function renderPhaseContent(gameState, role, voteCount, currentPlayer) {
    switch (gameState.phase) {
        case 'day':
            return <DayPhaseContent gameState={gameState} role={role}/>;
        case 'voting':
            return <VotingPhaseContent gameState={gameState} role={role} voteCount={voteCount}
                                       currentPlayer={currentPlayer}/>;
        case 'night':
            return <NightPhaseContent
                gameState={gameState}
                role={role}
                currentPlayer={currentPlayer}
                gameId={gameState.gameId}  // ADD THIS
            />;
        case 'ended':
            return <GameEndedContent gameState={gameState}/>;
        default:
            return <div>Unknown phase: {gameState.phase}</div>;
    }
}

// Day Phase Component
function DayPhaseContent({gameState, role}) {
    return (
        <div className="day-phase">
            <h3>☀️ Day Phase</h3>
            <p>Discuss who you think might be a werewolf. Voting will begin automatically in 30 seconds.</p>

            <div className="day-timer">
                <CountdownTimer duration={30}/>
            </div>
        </div>
    );
}

// Voting Phase Component
function VotingPhaseContent({gameState, role, voteCount, currentPlayer}) {
    const {vote} = useGame();
    const alivePlayers = getAlivePlayers(gameState.players);
    const [hasVoted, setHasVoted] = useState(false);

    // If current player is dead, show spectator view
    if (!currentPlayer.isAlive) {
        return (
            <div className="voting-phase spectator">
                <h3>👻 Spectating Vote</h3>
                <p>You are dead and cannot vote. Watch as the living decide...</p>

                {voteCount && (
                    <div className="vote-progress">
                        <p>Votes cast: {voteCount.votedCount} / {voteCount.totalCount}</p>
                    </div>
                )}
            </div>
        );
    }

    const handleVote = (targetSocketId) => {
        vote(targetSocketId);
        setHasVoted(true);
    };

    return (
        <div className="voting-phase">
            <h3>🗳️ Voting Phase</h3>
            <p>Vote to eliminate someone you suspect is a werewolf.</p>

            {voteCount && (
                <div className="vote-progress">
                    <p>Votes cast: {voteCount.votedCount} / {voteCount.totalCount}</p>
                </div>
            )}

            {!hasVoted ? (
                <div className="voting-area">
                    <h4>Choose who to eliminate:</h4>
                    <div className="vote-options">
                        {alivePlayers
                            .filter(player => player.socketId !== currentPlayer.socketId) // Can't vote for yourself
                            .map((player) => (
                                <button
                                    key={player.socketId}
                                    className="vote-button"
                                    onClick={() => handleVote(player.socketId)}
                                >
                                    Vote for {player.name}
                                </button>
                            ))}
                    </div>
                </div>
            ) : (
                <div className="vote-submitted">
                    <p>✅ Your vote has been submitted!</p>
                    <p>Waiting for other players to vote...</p>
                </div>
            )}
        </div>
    );
}

// Night Phase Component
function NightPhaseContent({gameState, role, currentPlayer}) {
    const {nightAction, confirmNightAction, error} = useGame();
    const [actionSubmitted, setActionSubmitted] = useState(false);
    const [actionConfirmed, setActionConfirmed] = useState(false);
    const alivePlayers = getAlivePlayers(gameState.players);

    // Reset states when role changes
    useEffect(() => {
        if (gameState.currentNightRole !== role) {
            setActionSubmitted(false);
            setActionConfirmed(false);
        }
    }, [gameState.currentNightRole, role]);

    // If current player is dead, show spectator view
    if (!currentPlayer.isAlive) {
        return (
            <div className="night-phase spectator">
                <h3>👻 Spectating Night</h3>
                <p>You are dead and cannot perform night actions. Rest in peace...</p>
                {gameState.currentNightRole && (
                    <div className="current-role-turn">
                        <p>{getNightRoleMessage(gameState.currentNightRole)}</p>
                    </div>
                )}
            </div>
        );
    }

    const targets = alivePlayers.filter(p => p.socketId !== currentPlayer.socketId);

    const handleNightAction = (action, targetSocketId) => {
        console.log(`🌙 Submitting action: ${action} -> ${targetSocketId}`);
        nightAction(action, targetSocketId);
        setActionSubmitted(true);
    };

    const handleConfirmAction = () => {
        console.log(`🌙 Confirming action for ${role}`);

        try {
            // Try the context function first
            confirmNightAction();
            setActionConfirmed(true);
        } catch (error) {
            console.error('❌ Context function failed, trying direct socket:', error);

            // Fallback - get socket instance directly
            try {
                const socket = io('http://localhost:3001');
                socket.emit('night-action-confirm', {gameId: gameState.gameId});
                setActionConfirmed(true);
            } catch (fallbackError) {
                console.error('❌ Fallback also failed:', fallbackError);
            }
        }
    };

    const isMyTurn = gameState.currentNightRole === role;

    console.log('🌙 Night phase debug:', {
        currentNightRole: gameState.currentNightRole,
        myRole: role,
        isMyTurn,
        actionSubmitted,
        actionConfirmed,
        playerName: currentPlayer.name,
        hasError: !!error
    });

    return (
        <div className="night-phase">
            <h3>🌙 Night Phase</h3>

            {/* Show any errors */}
            {error && (
                <div className="error-display">
                    ❌ {error}
                </div>
            )}

            <div className="debug-info"
                 style={{background: '#f0f0f0', padding: '10px', margin: '10px 0', fontSize: '12px'}}>
                <strong>Debug:</strong> Current Role: {gameState.currentNightRole}, Your Role: {role}, Your
                Turn: {isMyTurn ? 'Yes' : 'No'}
            </div>

            {gameState.currentNightRole && (
                <div className="current-role-turn">
                    <h4>{getNightRoleMessage(gameState.currentNightRole)}</h4>
                    {!isMyTurn && (
                        <p className="waiting-turn">Waiting for {gameState.currentNightRole}s to finish...</p>
                    )}
                </div>
            )}

            {isMyTurn ?
                renderNightActions(role, targets, handleNightAction, actionSubmitted, actionConfirmed, handleConfirmAction, nightActionInfo, witchDeathInfo) :
                <div className="waiting-turn-detail">
                    <p>It's not your turn yet. Wait for your role to be called.</p>
                </div>
            }
        </div>
    );
}

function renderNightActions(role, targets, handleNightAction, actionSubmitted, actionConfirmed, handleConfirmAction, nightActionInfo, witchDeathInfo) {
    if (actionConfirmed) {
        return (
            <div className="action-confirmed">
                <p>✅ Your action has been confirmed!</p>
                <p>Waiting for other roles to complete their actions...</p>
            </div>
        );
    }

    if (actionSubmitted) {
        return (
            <div className="action-submitted">
                <div className="action-summary">
                    <p>✅ {nightActionInfo?.message || 'Your night action has been submitted!'}</p>

                    {nightActionInfo?.targetName && (
                        <div className="target-info">
                            <p><strong>Target:</strong> {nightActionInfo.targetName}</p>
                            {nightActionInfo.targetRole && (
                                <p className={`target-role role-${nightActionInfo.targetRole}`}>
                                    <strong>Role:</strong> {getRoleIcon(nightActionInfo.targetRole)} {nightActionInfo.targetRole}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <button onClick={handleConfirmAction} className="confirm-action-btn">
                    Confirm and Continue
                </button>
            </div>
        );
    }

    switch (role) {
        case 'witch':
            return <WitchActions
                targets={targets}
                handleNightAction={handleNightAction}
                witchDeathInfo={witchDeathInfo}
            />;
        case 'werewolf':
            return (
                <div className="werewolf-actions">
                    <p>🐺 Choose someone to eliminate tonight:</p>
                    <div className="action-buttons">
                        {targets.map(player => (
                            <button
                                key={player.socketId}
                                className="kill-button"
                                onClick={() => handleNightAction('kill', player.socketId)}
                            >
                                Kill {player.name}
                            </button>
                        ))}
                    </div>
                </div>
            );
        case 'seer':
            return (
                <div className="seer-actions">
                    <p>🔮 Choose someone to investigate tonight:</p>
                    <div className="action-buttons">
                        {targets.map(player => (
                            <button
                                key={player.socketId}
                                className="investigate-button"
                                onClick={() => handleNightAction('investigate', player.socketId)}
                            >
                                Investigate {player.name}
                            </button>
                        ))}
                    </div>
                </div>
            );
        case 'doctor':
            return (
                <div className="doctor-actions">
                    <p>⚕️ Choose someone to protect tonight:</p>
                    <div className="action-buttons">
                        {targets.map(player => (
                            <button
                                key={player.socketId}
                                className="protect-button"
                                onClick={() => handleNightAction('protect', player.socketId)}
                            >
                                Protect {player.name}
                            </button>
                        ))}
                    </div>
                </div>
            );
        default:
            return (
                <div className="inactive-role">
                    <p>😴 Sleep tight! You have no actions during the night.</p>
                    <button onClick={handleConfirmAction} className="confirm-action-btn">
                        Continue
                    </button>
                </div>
            );
    }
}

function WitchActions({targets, handleNightAction, witchDeathInfo}) {
    const [actionType, setActionType] = useState(null);

    if (actionType) {
        return (
            <div className="witch-action-selection">
                <p>🧙‍♀️ Choose your target for {actionType}:</p>
                <div className="action-buttons">
                    {actionType === 'heal' && witchDeathInfo?.deathTarget ? (
                        // For healing, prioritize the dying player
                        <>
                            <button
                                className="heal-button priority"
                                onClick={() => handleNightAction('heal', witchDeathInfo.deathTarget.socketId)}
                            >
                                🧪 Heal {witchDeathInfo.deathTarget.name} (Will die tonight!)
                            </button>
                            {targets.filter(p => p.socketId !== witchDeathInfo.deathTarget.socketId).map(player => (
                                <button
                                    key={player.socketId}
                                    className="heal-button"
                                    onClick={() => handleNightAction('heal', player.socketId)}
                                >
                                    🧪 Heal {player.name}
                                </button>
                            ))}
                        </>
                    ) : (
                        targets.map(player => (
                            <button
                                key={player.socketId}
                                className={actionType === 'heal' ? 'heal-button' : 'poison-button'}
                                onClick={() => handleNightAction(actionType, player.socketId)}
                            >
                                {actionType === 'heal' ? '🧪 Heal' : '☠️ Poison'} {player.name}
                            </button>
                        ))
                    )}
                    <button
                        className="cancel-button"
                        onClick={() => setActionType(null)}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="witch-actions">
            <p>🧙‍♀️ Choose your action for tonight:</p>

            {witchDeathInfo && (
                <div className="death-info">
                    <h4>💀 Death Information:</h4>
                    <p>{witchDeathInfo.message}</p>
                </div>
            )}

            <div className="potion-buttons">
                <button
                    className="heal-button"
                    onClick={() => setActionType('heal')}
                >
                    🧪 Use Healing Potion
                </button>
                <button
                    className="poison-button"
                    onClick={() => setActionType('poison')}
                >
                    ☠️ Use Poison Potion
                </button>
                <button
                    className="skip-button"
                    onClick={() => handleNightAction('skip', null)}
                >
                    Skip Turn
                </button>
            </div>
        </div>
    );
}

function getNightRoleMessage(role) {
    const messages = {
        'werewolf': '🐺 Werewolves, choose your victim...',
        'seer': '🔮 Seer, choose someone to investigate...',
        'doctor': '⚕️ Doctor, choose someone to protect...',
        'witch': '🧙‍♀️ Witch, use your potions wisely...'
    };
    return messages[role] || `${role}'s turn...`;
}

// Game Ended Component
function GameEndedContent({gameState}) {
    const {winner} = useGame();

    return (
        <div className="game-ended">
            <h3>🎯 Game Over!</h3>
            {winner === 'werewolves' ? (
                <div className="werewolf-victory">
                    <h4>🐺 Werewolves Win! 🐺</h4>
                    <p>The werewolves have eliminated enough villagers to take control of the town!</p>
                </div>
            ) : winner === 'villagers' ? (
                <div className="villager-victory">
                    <h4>🏘️ Villagers Win! 🏘️</h4>
                    <p>All werewolves have been eliminated! The town is safe!</p>
                </div>
            ) : (
                <p>Game ended unexpectedly.</p>
            )}
        </div>
    );
}

// Countdown Timer Component
function CountdownTimer({duration}) {
    const [timeLeft, setTimeLeft] = useState(duration);

    useEffect(() => {
        if (timeLeft > 0) {
            const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [timeLeft]);

    return (
        <div className="countdown">
            <p>⏰ Time remaining: {timeLeft} seconds</p>
        </div>
    );
}