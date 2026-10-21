/**
 * Locating the running module.
 *
 * The project ships in two shapes and each one exposes its own directory:
 *  - The sources run as ES modules (`tsx`, `node dist/index.js`), where
 *    `import.meta.dirname` is the anchor.
 *  - The packaged build is a single CommonJS bundle, where `__dirname` is.
 *
 * `import.meta` cannot be read through `eval` (it is only valid in module
 * code), so the two shapes are detected at runtime instead.
 */

/**
 * The directory that contains the running module.
 *
 * Falls back to the current working directory when the runtime exposes
 * neither anchor, which keeps the lookup working in an unusual host.
 */
export function moduleDirectory(): string {
  if (typeof __dirname !== 'undefined') return __dirname;
  if (typeof import.meta.dirname === 'string') return import.meta.dirname;
  return process.cwd();
}
