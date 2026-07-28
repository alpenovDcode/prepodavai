/**
 * Быстрый rollback: NEXT_PUBLIC_PRESENTATION_CANVAS_EDITOR=0 возвращает
 * прежний редактор форм и iframe-превью без удаления старого кода.
 */
export const USE_PRESENTATION_CANVAS_EDITOR =
    process.env.NEXT_PUBLIC_PRESENTATION_CANVAS_EDITOR !== '0'
