export type StandardEventType = 'web_message' | 'video_comment' | 'live_comment' | 'private_message' | 'other';

export interface StandardEvent {
  version: '1';
  eventId: string;
  tenantId: string;
  channelAccountId: string | null;
  source: string;
  externalEventId: string;
  conversationId: string | null;
  type: StandardEventType;
  content: string;
  occurredAt: string;
  receivedAt: string;
  metadata: Record<string, unknown>;
}
