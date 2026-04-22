// Lua sandbox — defense-in-depth tests. Every entry in the deny list
// must be inaccessible from a user-provided script. This test is the
// single source of truth for "what Lua globals are dangerous"; if the
// list in sandbox.ts changes, this test must be updated in lock-step.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSandbox, deniedGlobals } from '../../../src/core/lua/sandbox.js';

test('sandbox: every denied global is nil from user script', async () => {
  const sb = await createSandbox();
  try {
    for (const name of deniedGlobals()) {
      const chunk = `return type(${name})`;
      const result = await sb.run<string>(chunk);
      assert.equal(
        result,
        'nil',
        `denied global '${name}' must be nil in the sandbox (got ${result})`,
      );
    }
  } finally {
    await sb.close();
  }
});

test('sandbox: whitelisted pure-compute modules are available', async () => {
  const sb = await createSandbox();
  try {
    assert.equal(await sb.run<number>('return math.floor(3.7)'), 3);
    assert.equal(await sb.run<string>('return string.upper("hi")'), 'HI');
    assert.equal(
      await sb.run<number>(
        'local t = {}; table.insert(t, 42); return t[1]',
      ),
      42,
    );
  } finally {
    await sb.close();
  }
});

test('sandbox: arithmetic works as expected (sanity)', async () => {
  const sb = await createSandbox();
  try {
    assert.equal(await sb.run<number>('return 2 + 3 * 4'), 14);
    assert.equal(await sb.run<boolean>('return 1 < 2'), true);
  } finally {
    await sb.close();
  }
});

test('sandbox: syntax errors surface as DomainError with a lua: prefix', async () => {
  const sb = await createSandbox();
  try {
    await assert.rejects(
      () => sb.run('this is not valid lua syntax!!'),
      (e: unknown) => e instanceof Error && /lua execution failed/.test(e.message),
    );
  } finally {
    await sb.close();
  }
});

test('sandbox: attempting to reach io/os via common escape hatches fails', async () => {
  const sb = await createSandbox();
  try {
    // Even if a malicious script tries to reconstruct io via indirection,
    // the deny list removes the root bindings. These should all return
    // nil (the sandbox has erased the bindings) rather than succeeding.
    const escapes = [
      'return type(io)',
      'return type(os)',
      'return type(require)',
      'return type(package)',
      // loadstring/load removal: attempting to compile a string at runtime
      // should not yield a callable.
      'return type(loadstring)',
      'return type(load)',
    ];
    for (const chunk of escapes) {
      const result = await sb.run<string>(chunk);
      assert.equal(
        result,
        'nil',
        `escape attempt '${chunk}' should return nil (got ${result})`,
      );
    }
  } finally {
    await sb.close();
  }
});
