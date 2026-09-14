import { LocalGameSession } from '../session/LocalGameSession'
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
const session = new LocalGameSession()
const unbind = bindCommands(ui, session)
if (import.meta.hot) import.meta.hot.dispose(() => {
    unbind()
    session.dispose()
})
import './styles.css'
