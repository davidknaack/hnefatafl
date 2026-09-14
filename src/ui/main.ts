import { bindSessionControls } from './sessionControls'
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
const unbind = bindSessionControls(ui, import.meta.env.VITE_RELAY_URL)
if (import.meta.hot) import.meta.hot.dispose(() => {
    unbind()
})
import './styles.css'
