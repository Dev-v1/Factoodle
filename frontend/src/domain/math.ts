import { ALL_LEVELS, OPERATIONS, type Operation, type PracticeLevel } from './model.ts';
export type Question = { left: number; right: number; symbol: string; answer: number };
export const games: { id: Operation; name: string; symbol: string; example: string; color: string }[] = [
  { id: 'addition', name: 'Add', symbol: '+', example: '2 + 3 = 5', color: 'coral' },
  { id: 'subtraction', name: 'Subtract', symbol: '−', example: '5 − 2 = 3', color: 'blue' },
  { id: 'multiplication', name: 'Multiply', symbol: '×', example: '3 × 2 = 6', color: 'purple' },
  { id: 'division', name: 'Divide', symbol: '÷', example: '6 ÷ 2 = 3', color: 'green' },
];
export function makeQuestion(operation: Operation, level: PracticeLevel, random = Math.random): Question {
  if (!OPERATIONS.includes(operation) || !ALL_LEVELS.includes(level)) throw new Error('Invalid level');
  const int = (low: number, high: number) => low + Math.min(high - low, Math.floor(random() * (high - low + 1)));
  if (typeof level === 'string') {
    const digits = Number(level.slice(-1));
    const rightLow = digits === 1 ? 1 : 10 ** (digits - 1);
    const rightHigh = 10 ** digits - 1;
    if (operation === 'multiplication') {
      const left = int(100, 999), right = int(rightLow, rightHigh);
      return { left, right, symbol: '×', answer: left * right };
    }
    if (operation === 'addition') {
      const left = int(100, 999), right = int(rightLow, rightHigh);
      return { left, right, symbol: '+', answer: left + right };
    }
    if (operation === 'subtraction') {
      const left = int(Math.max(100, rightLow), 999);
      const right = int(rightLow, Math.min(rightHigh, left));
      return { left, right, symbol: '−', answer: left - right };
    }
    const right = int(rightLow, rightHigh);
    const quotient = int(Math.max(1, Math.ceil(100 / right)), Math.floor(999 / right));
    return { left: right * quotient, right, symbol: '÷', answer: quotient };
  }
  const max = level;
  const answer = int(0, max);
  if (operation === 'addition') { const left = int(0, answer); return { left, right: answer - left, symbol: '+', answer }; }
  if (operation === 'subtraction') { const right = int(0, max - answer); return { left: answer + right, right, symbol: '−', answer }; }
  const factorMax = max >= 144 ? 12 : 10;
  if (operation === 'division') { const right = int(1, factorMax); return { left: answer * right, right, symbol: '÷', answer }; }
  const pairs: [number, number][] = [];
  for (let left = 0; left <= factorMax; left++) for (let right = 0; right <= factorMax; right++) if (left * right <= max) pairs.push([left, right]);
  const [left, right] = pairs[int(0, pairs.length - 1)];
  return { left, right, symbol: '×', answer: left * right };
}
