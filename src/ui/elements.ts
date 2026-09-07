function element<T extends HTMLElement>(id: string, type: new () => T): T {
    const found = document.getElementById(id)
    if (!(found instanceof type)) throw new Error(`Missing UI element: ${id}`)
    return found
}

export function getElements() {
    return {
        board: element('board', HTMLDivElement),
        from: element('fromInput', HTMLInputElement),
        to: element('toInput', HTMLInputElement),
        validate: element('validateBtn', HTMLButtonElement),
        apply: element('applyBtn', HTMLButtonElement),
        clear: element('clearBtn', HTMLButtonElement),
        log: element('log', HTMLPreElement),
        player: element('currentPlayer', HTMLDivElement),
        capturedA: element('capturedA', HTMLSpanElement),
        capturedD: element('capturedD', HTMLSpanElement),
        status: element('gameStatus', HTMLDivElement),
        currentMoves: element('currentMoves', HTMLUListElement),
        notation: element('notationInput', HTMLTextAreaElement),
        load: element('loadBtn', HTMLButtonElement),
        copy: element('copyGame', HTMLButtonElement),
        displayMoves: element('displayMovesToggle', HTMLInputElement),
        autoValidate: element('autoValidateToggle', HTMLInputElement),
        autoApply: element('autoApplyToggle', HTMLInputElement),
        howToPlay: element('howToPlayBtn', HTMLButtonElement),
        modal: element('howToPlayModal', HTMLDivElement),
        closeModal: element('closeModalBtn', HTMLButtonElement),
    }
}

export type UIElements = ReturnType<typeof getElements>
