/**
 * parseArgs — tiny argv parser. Lifted from guild-cli's pattern in
 * spirit: strict whitelist of known flags, reject typos loudly
 * (principle: silent acceptance is how verb contracts decay).
 *
 * Supported forms:
 *   --key value    (most common)
 *   --key=value    (one-shot assignment, convenient for shell aliases)
 *   --flag         (boolean, only if flag name is in `booleanFlags`)
 *   positional     (everything not preceded by --)
 */

import { DomainError } from '../../domain/shared/DomainError.js';

export interface ParsedArgs {
  readonly positional: ReadonlyArray<string>;
  readonly options: Readonly<Record<string, string>>;
  readonly flags: ReadonlySet<string>;
}

export function parseArgs(argv: ReadonlyArray<string>): ParsedArgs {
  const positional: string[] = [];
  const options: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!;
    if (tok.startsWith('--')) {
      const eq = tok.indexOf('=');
      if (eq >= 0) {
        options[tok.slice(2, eq)] = tok.slice(eq + 1);
      } else {
        const key = tok.slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) {
          flags.add(key);
        } else {
          options[key] = next;
          i++;
        }
      }
    } else {
      positional.push(tok);
    }
  }
  return { positional, options, flags };
}

export function rejectUnknownFlags(
  parsed: ParsedArgs,
  verb: string,
  known: ReadonlySet<string>,
): void {
  const seen = [...Object.keys(parsed.options), ...parsed.flags];
  const bad = seen.filter((k) => !known.has(k));
  if (bad.length > 0) {
    const validList = [...known].sort().map((k) => `--${k}`).join(', ');
    throw new DomainError(
      `unknown flag(s) for '${verb}': ${bad.map((b) => `--${b}`).join(', ')}. valid flags for '${verb}': ${validList}`,
      'flag',
    );
  }
}

export function requiredOption(
  parsed: ParsedArgs,
  verb: string,
  key: string,
): string {
  const v = parsed.options[key];
  if (v === undefined || v === '') {
    throw new DomainError(`'${verb}' requires --${key}`, 'flag');
  }
  return v;
}

export function optionalOption(
  parsed: ParsedArgs,
  key: string,
): string | undefined {
  return parsed.options[key];
}
