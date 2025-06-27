import {GameProvider, useGame} from './contexts/GameContext';
import GameLobby from './components/GameLobby';
import WaitingRoom from './components/WaitingRoom';
import GamePhase from './components/GamePhase';
import './styles/game.css';

function GameContent() {
    const {phase, connected, gameState} = useGame();

    // Add debugging
    console.log('App state:', {phase, connected, gameState: !!gameState});

    if (!connected) {
        return (
            <div className="loading">
                <h2>🔌 Connecting to server...</h2>
            </div>
        );
    }

    switch (phase) {
        case 'lobby':
            return <GameLobby/>;
        case 'waiting':
            return <WaitingRoom/>;
        case 'game':
        case 'day':      // ADD THESE EXPLICIT CASES
        case 'voting':   // ADD THESE EXPLICIT CASES
        case 'night':    // ADD THESE EXPLICIT CASES
        case 'ended':    // ADD THESE EXPLICIT CASES
            return <GamePhase/>;
        default:
            console.warn('Unknown phase:', phase);
            return <GameLobby/>;
    }
}

function App() {
    return (
        <GameProvider>
            <div className="app">
                <GameContent/>
            </div>
        </GameProvider>
    );
}

export default App;