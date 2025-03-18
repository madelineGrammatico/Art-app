import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function exclude<T, Key extends keyof T> (object:T, keys: Key[]): Omit<T, Key> {
  const newObject = {...object}
  for (const key of keys) {
    delete newObject[key]
  }
  return newObject
}