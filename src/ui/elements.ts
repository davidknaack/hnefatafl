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
        sessionMode: element('sessionMode', HTMLElement),
        sessionSide: element('sessionSide', HTMLSpanElement),
        connection: element('connectionStatus', HTMLDivElement),
        sessionError: element('sessionError', HTMLDivElement),
        sessionWarning: element('sessionWarning', HTMLDivElement),
        sessionHelp: element('sessionHelp', HTMLElement),
        recoveryStatus: element('recoveryStatus', HTMLDivElement),
        reviewRecovery: element('reviewRecoveryBtn', HTMLButtonElement),
        backupRecovery: element('backupRecoveryBtn', HTMLButtonElement),
        recoveryBackupHelp: element('recoveryBackupHelp', HTMLElement),
        onlineSetup: element('onlineSetup', HTMLDivElement),
        onlineActions: element('onlineActions', HTMLDivElement),
        onlineSide: element('onlineSide', HTMLSelectElement),
        roomInput: element('roomCodeInput', HTMLInputElement),
        roomCode: element('roomCodeDisplay', HTMLElement),
        createRoom: element('createRoomBtn', HTMLButtonElement),
        joinRoom: element('joinRoomBtn', HTMLButtonElement),
        copyRoom: element('copyRoomBtn', HTMLButtonElement),
        reconnect: element('reconnectBtn', HTMLButtonElement),
        leaveRoom: element('leaveRoomBtn', HTMLButtonElement),
        continueLocal: element('continueLocalBtn', HTMLButtonElement),
        newLocal: element('newLocalBtn', HTMLButtonElement),
        confirmation: element('sessionConfirmation', HTMLDivElement),
        confirmationText: element('sessionConfirmationText', HTMLParagraphElement),
        confirmSession: element('confirmSessionBtn', HTMLButtonElement),
        cancelSession: element('cancelSessionBtn', HTMLButtonElement),
    }
}

export type UIElements = ReturnType<typeof getElements>
