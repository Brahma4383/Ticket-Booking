/**
 * Joins class names, with Tailwind's own conflict rules applied.
 *
 * Re-exported from the `cn` package rather than written here, because the
 * shadcn components import that package directly and two different `cn`s in
 * one codebase is how `className` overrides quietly stop working: the naive
 * join keeps both `px-4` and `px-8` and lets the stylesheet's order decide,
 * where this one keeps the last.
 */
export { cn } from 'cn'
