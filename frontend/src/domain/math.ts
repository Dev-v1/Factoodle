import { LEVELS, OPERATIONS, type Operation } from './model.ts';
export type Question = { left: number; right: number; symbol: string; answer: number };
export const games: { id: Operation; name: string; symbol: string; example: string; color: string }[] = [
  { id: 'addition', name: 'Add', symbol: '+', example: '2 + 3 = 5', color: 'coral' },
  { id: 'subtraction', name: 'Subtract', symbol: '−', example: '5 − 2 = 3', color: 'blue' },
  { id: 'multiplication', name: 'Multiply', symbol: '×', example: '3 × 2 = 6', color: 'purple' },
  { id: 'division', name: 'Divide', symbol: '÷', example: '6 ÷ 2 = 3', color: 'green' },
];
export function makeQuestion(operation: Operation, max: number, random = Math.random): Question {
  if (!OPERATIONS.includes(operation) || !(LEVELS as readonly number[]).includes(max)) throw new Error('Invalid level');
  const int = (low: number, high: number) => low + Math.min(high - low, Math.floor(random() * (high - low + 1)));
  const answer = int(0, max);
  if (operation === 'addition') { const left = int(0, answer); return { left, right: answer - left, symbol: '+', answer }; }
  if (operation === 'subtraction') { const right = int(0, max - answer); return { left: answer + right, right, symbol: '−', answer }; }
  if (operation === 'division') { const right = int(1, 10); return { left: answer * right, right, symbol: '÷', answer }; }
  const pairs: [number, number][] = [];
  for (let left = 0; left <= 10; left++) for (let right = 0; right <= 10; right++) if (left * right <= max) pairs.push([left, right]);
  const [left, right] = pairs[int(0, pairs.length - 1)];
  return { left, right, symbol: '×', answer: left * right };
}
