import { mountClient } from './application'
import './styles.css'

const dispose = mountClient(document)
if (import.meta.hot) import.meta.hot.dispose(dispose)
