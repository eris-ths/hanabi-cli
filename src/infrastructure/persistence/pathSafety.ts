import pathDefault, { type PlatformPath } from 'node:path';

export type PathApi = Pick<PlatformPath, 'relative' | 'isAbsolute' | 'sep'>;

export function makeIsUnderBase(
  api: PathApi,
): (absTarget: string, absBase: string) => boolean {
  return function isUnderBase(absTarget: string, absBase: string): boolean {
    if (absTarget === absBase) return true;
    const rel = api.relative(absBase, absTarget);
    if (rel === '') return true;
    if (rel === '..') return false;
    if (rel.startsWith('..' + api.sep)) return false;
    if (rel.startsWith('../')) return false;
    if (api.isAbsolute(rel)) return false;
    return true;
  };
}

export const isUnderBase = makeIsUnderBase(pathDefault);
