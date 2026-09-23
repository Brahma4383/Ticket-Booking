/** `₹1,299` — Indian grouping, no decimals, used for every fare on screen. */
export function formatINR(value: number) {
  return `\u20B9${Math.round(value).toLocaleString('en-IN')}`
}
