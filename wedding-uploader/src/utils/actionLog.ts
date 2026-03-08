export type ActionType =
  | 'page_navigate'
  | 'login_success'
  | 'upload_start'
  | 'upload_success'
  | 'upload_error'
  | 'gallery_load'
  | 'gallery_verify'
  | 'lightbox_open'
  | 'error';

export interface ActionEntry {
  type: ActionType;
  detail?: string;
  timestamp: string;
}

const MAX_ENTRIES = 50;
const log: ActionEntry[] = [];

export function logAction(type: ActionType, detail?: string): void {
  const entry: ActionEntry = {
    type,
    detail,
    timestamp: new Date().toISOString(),
  };

  log.push(entry);

  if (log.length > MAX_ENTRIES) {
    log.splice(0, log.length - MAX_ENTRIES);
  }
}

export function getActionLog(): ActionEntry[] {
  return [...log];
}
