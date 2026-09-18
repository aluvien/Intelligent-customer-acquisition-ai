export type MessageOrderingItem = {
  id: string;
  createdAt: string;
  visitorVisibilitySeq?: string;
};

function compareDecimalStrings(left: string, right: string): number | undefined {
  if (!/^\d+$/.test(left) || !/^\d+$/.test(right)) return undefined;
  const normalizedLeft = left.replace(/^0+(?=\d)/, '');
  const normalizedRight = right.replace(/^0+(?=\d)/, '');
  if (normalizedLeft.length !== normalizedRight.length) return normalizedLeft.length < normalizedRight.length ? -1 : 1;
  if (normalizedLeft === normalizedRight) return 0;
  return normalizedLeft < normalizedRight ? -1 : 1;
}

function normalizedDecimalSequence(value: string | undefined): string | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  return value.replace(/^0+(?=\d)/, '');
}

export function compareChatMessages(left: MessageOrderingItem, right: MessageOrderingItem): number {
  const leftSequence = normalizedDecimalSequence(left.visitorVisibilitySeq);
  const rightSequence = normalizedDecimalSequence(right.visitorVisibilitySeq);
  // Keep one global ordering rule for mixed old/new responses. Unknown legacy
  // rows form a deterministic prefix ordered by their original timestamp;
  // known rows then use the lossless visibility sequence. Pairwise switching
  // between timestamp and sequence order would violate comparator transitivity.
  if (leftSequence === undefined || rightSequence === undefined) {
    if (leftSequence !== rightSequence) return leftSequence === undefined ? -1 : 1;
  } else {
    const sequenceOrder = compareDecimalStrings(leftSequence, rightSequence);
    if (sequenceOrder !== undefined && sequenceOrder !== 0) return sequenceOrder;
  }
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}
