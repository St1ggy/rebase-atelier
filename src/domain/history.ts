export type History<T> = { past: T[]; present: T; future: T[] }

export function record<T>(history: History<T>, value: T): History<T> {
  if (JSON.stringify(history.present) === JSON.stringify(value)) return history

  return { past: [...history.past.slice(-199), history.present], present: value, future: [] }
}

export function undo<T>(history: History<T>): History<T> {
  const value = history.past.at(-1)

  return value === undefined
    ? history
    : {
        past: history.past.slice(0, -1),
        present: value,
        future: [history.present, ...history.future],
      }
}

export function redo<T>(history: History<T>): History<T> {
  const value = history.future[0]

  return value === undefined
    ? history
    : {
        past: [...history.past, history.present],
        present: value,
        future: history.future.slice(1),
      }
}
