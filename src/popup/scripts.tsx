import {createRoot} from 'react-dom/client'
import PopupApp from './PopupApp'
import './styles.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Popup root element not found')
}

createRoot(rootElement).render(<PopupApp />)
