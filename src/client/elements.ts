export function clientElements(root: ParentNode) {
    function get<T extends HTMLElement>(id: string, type: new () => T): T {
        const element = root.querySelector(`#${id}`)
        if (!(element instanceof type)) throw new Error(`Missing client element: ${id}`)
        return element
    }
    return {
        board: get('game-board', HTMLDivElement), title: get('turn-title', HTMLHeadingElement),
        detail: get('turn-detail', HTMLParagraphElement), marker: get('turn-marker', HTMLSpanElement),
        moveNumber: get('move-number', HTMLSpanElement), feedback: get('feedback', HTMLParagraphElement),
        clear: get('cancel-selection', HTMLButtonElement), newGame: get('new-button', HTMLButtonElement),
        attackerCard: get('attacker-card', HTMLDivElement), defenderCard: get('defender-card', HTMLDivElement),
        attackers: get('attacker-count', HTMLElement), defenders: get('defender-count', HTMLElement),
        captures: get('capture-summary', HTMLParagraphElement), history: get('game-history', HTMLOListElement),
        historyScroll: get('history-scroll', HTMLDivElement), empty: get('empty-history', HTMLParagraphElement),
        recordCount: get('record-count', HTMLSpanElement), helpButton: get('help-button', HTMLButtonElement),
        help: get('help-dialog', HTMLDialogElement), closeHelp: get('close-help', HTMLButtonElement),
        importButton: get('import-button', HTMLButtonElement), importDialog: get('import-dialog', HTMLDialogElement),
        importText: get('import-text', HTMLTextAreaElement), importError: get('import-error', HTMLParagraphElement),
        library: get('game-library', HTMLSelectElement), libraryStatus: get('library-status', HTMLParagraphElement),
        load: get('load-game', HTMLButtonElement), cancelImport: get('cancel-import', HTMLButtonElement),
        exportButton: get('export-button', HTMLButtonElement), exportDialog: get('export-dialog', HTMLDialogElement),
        exportText: get('export-text', HTMLTextAreaElement), exportStatus: get('export-status', HTMLParagraphElement),
        copy: get('copy-game', HTMLButtonElement), download: get('download-game', HTMLButtonElement),
        closeExport: get('close-export', HTMLButtonElement), confirm: get('confirm-dialog', HTMLDialogElement),
        confirmDescription: get('confirm-description', HTMLParagraphElement), replace: get('confirm-replace', HTMLButtonElement),
        cancelReplace: get('cancel-replace', HTMLButtonElement),
    }
}
export type ClientElements = ReturnType<typeof clientElements>
