import {createContext, useContext, useReducer, useEffect} from 'react';
import {io} from 'socket.io-client';

const GameContext = createContext();

const socket = io('http://localhost:3001', {
    transports: ['websocket', 'polling'],
    autoConnect: false
});

const initialState = {
    connected: false,
    gameId: null,
    playerName: '',
    role: null,
    gameState: null,
    players: [],
    phase: 'lobby',
    error: null,
    isHost: false,
    nightResults: null,
    votingResults: null,
    voteCount: null,
    seerResult: null,
    winner: null,
    allPlayerRoles: null,
    currentNightRole: null,
    nightRoleMessage: null,
    nightActionInfo: null,    // ADD THIS
    witchDeathInfo: null      // ADD THIS
};

function gameReducer(state, action) {
    console.log('🔄 State update:', action.type, action.payload);

    switch (action.type) {
        case 'SET_CONNECTED':
            return {...state, connected: action.payload};
        case 'SET_GAME_ID':
            return {...state, gameId: action.payload};
        case 'SET_PLAYER_NAME':
            return {...state, playerName: action.payload};
        case 'SET_ROLE':
            return {...state, role: action.payload};
        case 'SET_GAME_STATE':
            return {
                ...state,
                gameState: action.payload,
                players: action.payload?.players || []
            };
        case 'SET_PHASE':
            return {...state, phase: action.payload};
        case 'SET_IS_HOST':
            return {...state, isHost: action.payload};
        case 'SET_ERROR':
            return {...state, error: action.payload};
        case 'CLEAR_ERROR':
            return {...state, error: null};
        case 'RESET_GAME':
            return {...initialState, connected: state.connected};
        case 'SET_NIGHT_RESULTS':
            return {...state, nightResults: action.payload};
        case 'SET_VOTING_RESULTS':
            return {...state, votingResults: action.payload};
        case 'SET_VOTE_COUNT':
            return {...state, voteCount: action.payload};
        case 'SET_WINNER':
            return {...state, winner: action.payload};
        case 'SET_ALL_ROLES':
            return {...state, allPlayerRoles: action.payload};
        case 'CLEAR_GAME_DATA':
            return {
                ...state,
                role: null,
                nightResults: null,
                votingResults: null,
                voteCount: null,
                seerResult: null,
                winner: null,
                allPlayerRoles: null,
                error: null  // ADD THIS
            };
        case 'SET_CURRENT_NIGHT_ROLE':
            return {...state, currentNightRole: action.payload};
        case 'SET_NIGHT_ROLE_MESSAGE':
            return {...state, nightRoleMessage: action.payload};
        case 'SET_NIGHT_ACTION_INFO':
            return {...state, nightActionInfo: action.payload};
        case 'SET_WITCH_DEATH_INFO':
            return {...state, witchDeathInfo: action.payload};
        case 'SET_SEER_RESULT':
            return {...state, seerResult: action.payload};
        default:
            console.warn('Unknown action type:', action.type);
            return state;
    }
}

export function GameProvider({children}) {
    const [state, dispatch] = useReducer(gameReducer, initialState);

    useEffect(() => {
        socket.connect();

        socket.on('connect', () => {
            console.log('🟢 Connected to server');
            dispatch({type: 'SET_CONNECTED', payload: true});
        });

        socket.on('disconnect', () => {
            console.log('🔴 Disconnected from server');
            dispatch({type: 'SET_CONNECTED', payload: false});
        });

        socket.on('game-created', (data) => {
            console.log('🎮 Game created:', data);
            dispatch({type: 'SET_PHASE', payload: 'waiting'});
            dispatch({type: 'SET_IS_HOST', payload: true});
            dispatch({type: 'SET_GAME_STATE', payload: data.game});
        });

        socket.on('player-joined', (data) => {
            console.log('👤 Player joined:', data);
            dispatch({type: 'SET_GAME_STATE', payload: data.game});

            // If this socket joined, update phase and host status
            const currentPlayer = data.game.players.find(p => p.socketId === socket.id);
            if (currentPlayer) {
                dispatch({type: 'SET_PHASE', payload: 'waiting'});
                dispatch({type: 'SET_IS_HOST', payload: currentPlayer.isHost});
            }
        });

        socket.on('game-started', (data) => {
            console.log('🚀 Game started:', data);
            dispatch({type: 'SET_PHASE', payload: 'game'});
            dispatch({type: 'SET_GAME_STATE', payload: data.game});
            if (data.currentRole) {
                dispatch({type: 'SET_CURRENT_NIGHT_ROLE', payload: data.currentRole});
            }
            if (data.nightRoleMessage) {
                dispatch({type: 'SET_NIGHT_ROLE_MESSAGE', payload: data.nightRoleMessage});
            }
        });

        socket.on('role-assigned', (data) => {
            console.log('🎭 Role assigned:', data.role);
            dispatch({type: 'SET_ROLE', payload: data.role});
            dispatch({type: 'SET_GAME_STATE', payload: data.gameState});
        });

        socket.on('error', (data) => {
            console.error('❌ Server error:', data.message);
            dispatch({type: 'SET_ERROR', payload: data.message});

            // Clear error after 5 seconds
            setTimeout(() => {
                dispatch({type: 'CLEAR_ERROR'});
            }, 5000);
        });
        socket.on('day-phase-started', (data) => {
            console.log('☀️ Day phase started:', data);
            dispatch({type: 'SET_GAME_STATE', payload: data.game});
            dispatch({type: 'SET_NIGHT_RESULTS', payload: data.nightResults});
        });

        socket.on('voting-phase-started', (data) => {
            console.log('🗳️ Voting phase started:', data);
            dispatch({type: 'SET_GAME_STATE', payload: data.game});
        });

        socket.on('night-phase-started', (data) => {
            console.log('🌙 Night phase started:', data);
            dispatch({type: 'SET_GAME_STATE', payload: data.game});
        });

        socket.on('voting-results', (data) => {
            console.log('📊 Voting results:', data);
            dispatch({type: 'SET_GAME_STATE', payload: data.game});
            dispatch({type: 'SET_VOTING_RESULTS', payload: data});
        });

        socket.on('vote-update', (data) => {
            console.log('🗳️ Vote update:', data);
            dispatch({type: 'SET_VOTE_COUNT', payload: data});
        });

        socket.on('seer-result', (data) => {
            console.log('🔮 Seer result:', data);
            dispatch({type: 'SET_SEER_RESULT', payload: data});
        });

        socket.on('game-ended', (data) => {
            console.log('🎯 Game ended:', data);
            dispatch({type: 'SET_GAME_STATE', payload: data.game});
            dispatch({type: 'SET_WINNER', payload: data.winner});
            dispatch({type: 'SET_ALL_ROLES', payload: data.allPlayerRoles}); // NEW
        });
        socket.on('returned-to-lobby', (data) => {
            console.log('🔄 Returned to lobby:', data);
            dispatch({type: 'SET_PHASE', payload: 'waiting'});
            dispatch({type: 'SET_GAME_STATE', payload: data.game});
            dispatch({type: 'CLEAR_GAME_DATA'}); // Clear game-specific data

            // Clear any lingering error messages
            dispatch({type: 'CLEAR_ERROR'});
        });
        socket.on('night-role-turn', (data) => {
            console.log('🌙 Night role turn:', data);
            dispatch({type: 'SET_CURRENT_NIGHT_ROLE', payload: data.currentRole});
            dispatch({type: 'SET_NIGHT_ROLE_MESSAGE', payload: data.message});

            // IMPORTANT: Update the game state too
            if (data.game) {
                dispatch({type: 'SET_GAME_STATE', payload: data.game});
            }
        });
        socket.on('night-action-confirmed', (data) => {
            console.log('✅ Night action confirmed:', data);
            // This confirms the action was received by server
        });
        socket.on('night-action-submitted', (data) => {
            console.log('📝 Night action submitted:', data);
            // This confirms the action was submitted
        });
        socket.on('night-action-submitted', (data) => {
            console.log('📝 Night action submitted:', data);
            dispatch({type: 'SET_NIGHT_ACTION_INFO', payload: data});
        });

        socket.on('witch-death-info', (data) => {
            console.log('🧙‍♀️ Witch death info:', data);
            dispatch({type: 'SET_WITCH_DEATH_INFO', payload: data});
        });

        socket.on('seer-result', (data) => {
            console.log('🔮 Seer result:', data);
            dispatch({type: 'SET_SEER_RESULT', payload: data});
        });

        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('game-created');
            socket.off('player-joined');
            socket.off('game-started');
            socket.off('role-assigned');
            socket.off('error');
            socket.disconnect();
        };
    }, []);

    const createGame = (gameId, playerName) => {
        dispatch({type: 'CLEAR_ERROR'});
        socket.emit('create-game', {gameId, playerName});
        dispatch({type: 'SET_GAME_ID', payload: gameId});
        dispatch({type: 'SET_PLAYER_NAME', payload: playerName});
    };

    const joinGame = (gameId, playerName) => {
        dispatch({type: 'CLEAR_ERROR'});
        socket.emit('join-game', {gameId, playerName});
        dispatch({type: 'SET_GAME_ID', payload: gameId});
        dispatch({type: 'SET_PLAYER_NAME', payload: playerName});
    };

    const startGame = () => {
        socket.emit('start-game', {gameId: state.gameId});
    };

    const vote = (targetSocketId) => {
        socket.emit('vote', {gameId: state.gameId, targetSocketId});
    };

    const leaveGame = () => {
        socket.emit('leave-game', {gameId: state.gameId});
        dispatch({type: 'RESET_GAME'});
    };
    const nightAction = (action, targetSocketId) => {
        socket.emit('night-action', {
            gameId: state.gameId,
            action,
            targetSocketId
        });
    };
    const returnToLobby = () => {
        socket.emit('return-to-lobby', {gameId: state.gameId});
    };
    const confirmNightAction = () => {
        console.log('🌙 Confirming night action for gameId:', state.gameId);
        if (!state.gameId) {
            console.error('❌ No gameId available for night action confirmation');
            return;
        }
        socket.emit('night-action-confirm', {gameId: state.gameId});
    };

    return (
        <GameContext.Provider value={{
            ...state,
            createGame,
            joinGame,
            startGame,
            vote,
            nightAction,
            confirmNightAction,  // ADD THIS
            returnToLobby,
            leaveGame
        }}>
            {children}
        </GameContext.Provider>
    );
}

// THIS IS THE CRITICAL PART - MAKE SURE THIS IS EXACTLY HERE:
export const useGame = () => {
    const context = useContext(GameContext);
    if (!context) {
        throw new Error('useGame must be used within a GameProvider');
    }
    return context;
};