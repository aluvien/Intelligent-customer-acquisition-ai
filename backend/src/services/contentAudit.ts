export function detectBlockedWords(content: string): string[] {
  const words = (process.env.CONTENT_BLOCK_WORDS || '').split(',').map((word) => word.trim()).filter(Boolean);
  return words.filter((word) => content.includes(word));
}

export function assertContentAllowed(content: string): void {
  const detectedWords = detectBlockedWords(content);
  if (detectedWords.length > 0) {
    throw new AppError(400, 'CONTENT_BLOCKED', '消息包含被禁止的内容');
  }
}
import { AppError } from '../errors';
