import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import './index.css'
import './styles/game.css'  // Add this line
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <App/>
    </StrictMode>,
)