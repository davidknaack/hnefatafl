import { mountLocalClient } from './client'
import './styles.css'

const dispose = mountLocalClient(document)
if (import.meta.hot) import.meta.hot.dispose(dispose)
