import 'server-only';
import { AccessToken, RoomServiceClient, WebhookReceiver } from 'livekit-server-sdk';
import { missingEnv, requireEnv } from './config';

// LiveKit (Cloud or self-hosted). LIVEKIT_URL is the wss:// address browsers connect to.
const KEYS = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'];

export function isLiveKitConfigured() {
  return missingEnv(KEYS).length === 0;
}

// Learners can talk, share their camera and chat. Only staff (facilitators and admins)
// get roomAdmin, which is what "End class" and muting others need.
export async function createJoinToken({ room, identity, name, ttlSeconds, staff = false }) {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = requireEnv('LiveKit', KEYS);
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name,
    ttl: Math.max(60, Math.floor(ttlSeconds)),
    metadata: JSON.stringify({ role: staff ? 'facilitator' : 'learner' }),
  });
  token.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: false,
    roomAdmin: staff,
  });
  return { token: await token.toJwt(), serverUrl: LIVEKIT_URL };
}

export async function receiveWebhook(rawBody, authHeader) {
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = requireEnv('LiveKit', ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']);
  return new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET).receive(rawBody, authHeader);
}

// Ends a room for everyone (used when a class's join window closes).
export async function closeRoom(room) {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = requireEnv('LiveKit', KEYS);
  const host = LIVEKIT_URL.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  try {
    await new RoomServiceClient(host, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).deleteRoom(room);
  } catch (error) {
    // A room nobody ever joined does not exist; that is fine
    if (!/not.?found/i.test(error?.message || '')) throw error;
  }
}

// Identities carry who the participant is, so webhooks can record attendance.
export const learnerIdentity = (registrationId) => `reg:${registrationId}`;
export const staffIdentity = (userId) => `staff:${userId}`;
export function registrationIdFromIdentity(identity) {
  const match = /^reg:([0-9a-f-]{36})$/i.exec(identity || '');
  return match ? match[1] : null;
}
