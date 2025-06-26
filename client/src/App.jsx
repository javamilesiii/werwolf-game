import {GameProvider, useGame} from './contexts/GameContext';
import GameLobby from './components/GameLobby';
import WaitingRoom from './components/WaitingRoom';
import './styles/game.css';

function GameContent() {
    const {phase, connected} = useGame();

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
            return <div>Game is starting...</div>; // We'll build this next
        default:
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