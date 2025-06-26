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
    isHost: false
};

function gameReducer(state, action) {
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
            return {...state, gameState: action.payload, players: action.payload?.players || []};
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
        default:
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
        });

        socket.on('game-started', (data) => {
            console.log('🚀 Game started:', data);
            dispatch({type: 'SET_PHASE', payload: 'game'});
            dispatch({type: 'SET_GAME_STATE', payload: data.game});
        });

        socket.on('role-assigned', (data) => {
            console.log('🎭 Role assigned:', data.role);
            dispatch({type: 'SET_ROLE', payload: data.role});
            dispatch({type: 'SET_GAME_STATE', payload: data.gameState});
        });

        socket.on('error', (data) => {
            console.error('❌ Error:', data.message);
            dispatch({type: 'SET_ERROR', payload: data.message});
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

    return (
        <GameContext.Provider value={{
            ...state,
            createGame,
            joinGame,
            startGame,
            vote,
            leaveGame
        }}>
            {children}
        </GameContext.Provider>
    );
}

export const useGame = () => {
    const context = useContext(GameContext);
    if (!context) {
        throw new Error('useGame must be used within a GameProvider');
    }
    return context;
};