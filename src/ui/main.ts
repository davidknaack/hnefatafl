import { HnefataflEngine } from '../HnefataflEngine'
import { bindCommands } from './commands'
import { getElements } from './elements'

const ui = getElements()
ui.howToPlay.onclick = () => {
    ui.modal.style.display = 'flex'
}
ui.closeModal.onclick = () => {
    ui.modal.style.display = 'none'
}
ui.modal.onclick = (event) => {
    if (event.target === ui.modal) ui.modal.style.display = 'none'
}
bindCommands(ui, new HnefataflEngine())
import './styles.css'
