import { YamlGameRepository } from '../../infrastructure/persistence/YamlGameRepository.js';

export function resolveContentRoot(): string {
  return process.env['FIREWORKS_ROOT'] ?? process.cwd();
}

export function buildRepo() {
  return new YamlGameRepository(resolveContentRoot());
}
