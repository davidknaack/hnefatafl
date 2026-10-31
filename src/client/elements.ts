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
        attackerCaptured: get('attacker-captured', HTMLParagraphElement), defenderCaptured: get('defender-captured', HTMLParagraphElement),
        history: get('game-history', HTMLOListElement),
        saveNote: get('save-note', HTMLParagraphElement),
        comments: get('move-comments', HTMLElement), commentHeading: get('comment-heading', HTMLHeadingElement),
        commentList: get('comment-list', HTMLDivElement), commentForm: get('comment-form', HTMLFormElement),
        commentText: get('comment-text', HTMLTextAreaElement), commentCount: get('comment-count', HTMLSpanElement),
        commentAdd: get('add-comment', HTMLButtonElement), commentStatus: get('comment-status', HTMLParagraphElement),
        historyScroll: get('history-scroll', HTMLDivElement), empty: get('empty-history', HTMLParagraphElement),
        recordCount: get('record-count', HTMLSpanElement), helpButton: get('help-button', HTMLButtonElement),
        help: get('help-dialog', HTMLDialogElement), closeHelp: get('close-help', HTMLButtonElement),
        importButton: get('import-button', HTMLButtonElement), importDialog: get('import-dialog', HTMLDialogElement),
        importText: get('import-text', HTMLTextAreaElement), importError: get('import-error', HTMLParagraphElement),
        library: get('game-library', HTMLSelectElement), libraryStatus: get('library-status', HTMLParagraphElement),
        chooseFile: get('choose-game-file', HTMLButtonElement), file: get('game-file', HTMLInputElement),
        dropZone: get('import-drop-zone', HTMLDivElement), fileStatus: get('file-status', HTMLParagraphElement),
        load: get('load-game', HTMLButtonElement), cancelImport: get('cancel-import', HTMLButtonElement),
        exportButton: get('export-button', HTMLButtonElement), exportDialog: get('export-dialog', HTMLDialogElement),
        exportText: get('export-text', HTMLTextAreaElement), exportStatus: get('export-status', HTMLParagraphElement),
        exportHelp: get('export-help', HTMLParagraphElement),
        copy: get('copy-game', HTMLButtonElement), download: get('download-game', HTMLButtonElement),
        closeExport: get('close-export', HTMLButtonElement), confirm: get('confirm-dialog', HTMLDialogElement),
        confirmDescription: get('confirm-description', HTMLParagraphElement), replace: get('confirm-replace', HTMLButtonElement),
        cancelReplace: get('cancel-replace', HTMLButtonElement),
        reviewControls: get('review-controls', HTMLDivElement), reviewStart: get('review-start', HTMLButtonElement),
        reviewBack: get('review-back', HTMLButtonElement), reviewNext: get('review-next', HTMLButtonElement),
        reviewEnd: get('review-end', HTMLButtonElement), reviewPosition: get('review-position', HTMLSpanElement),
        movesTab: get('moves-tab', HTMLButtonElement),
        variantsTab: get('variants-tab', HTMLButtonElement), movesPanel: get('moves-panel', HTMLDivElement),
        variantsPanel: get('variants-panel', HTMLDivElement), variantList: get('variant-list', HTMLDivElement),
        describe: get('describe-variant', HTMLButtonElement), nextDialog: get('next-dialog', HTMLDialogElement),
        nextChoices: get('next-choices', HTMLDivElement), cancelNext: get('cancel-next', HTMLButtonElement),
        variantDialog: get('variant-dialog', HTMLDialogElement), variantTitle: get('variant-title', HTMLHeadingElement),
        variantHelp: get('variant-help', HTMLParagraphElement), variantDescription: get('variant-description', HTMLInputElement),
        variantError: get('variant-error', HTMLParagraphElement), cancelVariant: get('cancel-variant', HTMLButtonElement),
        saveVariant: get('save-variant', HTMLButtonElement),
    }
}
export type ClientElements = ReturnType<typeof clientElements>
