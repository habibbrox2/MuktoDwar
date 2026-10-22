/**
 * Types for the WOFF2 coverage reader.
 *
 * The script is plain JavaScript so it can also be run straight from a
 * shell; this declaration file gives the test suite the type it needs.
 */

/**
 * Read the code points a WOFF2 font file maps.
 *
 * Returns the set of code points the font's `cmap` table covers.
 */
export function woff2CodePoints(path: string): Set<number>;
