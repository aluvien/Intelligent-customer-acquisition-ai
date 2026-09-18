import { compareChatMessages } from './messageOrdering';

const item = (id: string, createdAt: string, visitorVisibilitySeq?: string) => ({ id, createdAt, visitorVisibilitySeq });

test('mixed legacy and visibility-sequence messages have one transitive order', () => {
  const messages = [
    item('a', '2026-01-01', '9'),
    item('b', '2026-01-02'),
    item('c', '2026-01-03', '1'),
  ];
  const expected = ['b', 'c', 'a'];
  const permutations = [messages, [messages[2], messages[0], messages[1]], [messages[1], messages[2], messages[0]]];
  permutations.forEach((value) => expect(value.slice().sort(compareChatMessages).map((entry) => entry.id)).toEqual(expected));
});

test('visibility sequences compare without JavaScript safe-integer rounding', () => {
  const lower = item('lower', '2026-01-01', '9007199254740992');
  const higher = item('higher', '2025-01-01', '9007199254740993');
  expect(compareChatMessages(lower, higher)).toBeLessThan(0);
  expect(compareChatMessages(higher, lower)).toBeGreaterThan(0);
});
