export const COORD_BODY = "[A-K](?:10|11|[1-9])";
export const COORD_CAPTURE_RE = /^([A-K])(10|11|[1-9])$/i;
export const MOVE_RE = new RegExp(`^(${COORD_BODY})-(${COORD_BODY})(?:\\(([^)]+)\\))?$`, 'i');
export const CAPTURE_RE = new RegExp(COORD_BODY, 'g');
