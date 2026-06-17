declare module 'mgrs' {
  export function forward(pt: [number, number], accuracy?: number): string
  export function inverse(mgrs: string): [number, number, number, number]
  export function toPoint(mgrs: string): [number, number]
}
