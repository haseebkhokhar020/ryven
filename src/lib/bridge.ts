import type { RyvenBridge } from '../../shared/contracts';
declare global { interface Window { ryven?: RyvenBridge } }
export const bridge = window.ryven;
export const desktop = Boolean(bridge);
export function message(error: unknown): string { return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(error); }
