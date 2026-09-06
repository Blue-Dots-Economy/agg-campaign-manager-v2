export type Lifecycle = "New" | "Active" | "At Risk" | "Inactive";

export interface ConnectionBreakdown {
  requested: number;
  accepted: number;
  declined: number;
  cancelled: number;
}

export const sumBreakdown = (b: ConnectionBreakdown): number =>
  b.requested + b.accepted + b.declined + b.cancelled;

export interface Participant {
  id: string;
  name: string;
  joined: string;
  lastSeen: string;
  profileCompletion: number;
  initiated: number;
  received: number;
  initiatedBreakdown: ConnectionBreakdown;
  receivedBreakdown: ConnectionBreakdown;
  lifecycle: Lifecycle;
}

export interface ParticipantSummary {
  profilesRegistered: number;
  profilesComplete: number;
  receivedConnections: number;
  totalAccountHolders: number;
  avgProfilesPerUser: number;
  avgActionsPerUser: number;
}

const PROVIDERS: Omit<Participant, "initiated" | "received">[] = [
  {
    id: "b95ad20c-7ff2-4ba9-9c84-fc17c667276e",
    name: "Sahyog Foundation",
    joined: "2026-07-13",
    lastSeen: "8d ago",
    profileCompletion: 100,
    initiatedBreakdown: { requested: 0, accepted: 1, declined: 0, cancelled: 0 },
    receivedBreakdown: { requested: 0, accepted: 0, declined: 1, cancelled: 1 },
    lifecycle: "Inactive",
  },
  {
    id: "45cc89e3-ffd0-43d9-8314-f1a425ae2a80",
    name: "Test Service Provider",
    joined: "2026-08-28",
    lastSeen: "8d ago",
    profileCompletion: 67,
    initiatedBreakdown: { requested: 0, accepted: 0, declined: 0, cancelled: 0 },
    receivedBreakdown: { requested: 0, accepted: 0, declined: 0, cancelled: 0 },
    lifecycle: "Inactive",
  },
  {
    id: "d458f423-ecfe-47cf-9a4d-d49f9728537a",
    name: "ABCD ltd",
    joined: "2026-07-23",
    lastSeen: "1mo ago",
    profileCompletion: 100,
    initiatedBreakdown: { requested: 1, accepted: 0, declined: 0, cancelled: 0 },
    receivedBreakdown: { requested: 1, accepted: 0, declined: 0, cancelled: 0 },
    lifecycle: "At Risk",
  },
];

const PROVIDER_SUMMARY: ParticipantSummary = {
  profilesRegistered: 3,
  profilesComplete: 2,
  receivedConnections: 2,
  totalAccountHolders: 3,
  avgProfilesPerUser: 1,
  avgActionsPerUser: 2.5,
};

function withTotals(p: Omit<Participant, "initiated" | "received">): Participant {
  return {
    ...p,
    initiated: sumBreakdown(p.initiatedBreakdown),
    received: sumBreakdown(p.receivedBreakdown),
  };
}

export function getProviderParticipants(): Participant[] {
  return PROVIDERS.map(withTotals);
}

export function getProviderSummary(): ParticipantSummary {
  return { ...PROVIDER_SUMMARY };
}

const SEEKERS: Omit<Participant, "initiated" | "received">[] = [
  { id: "3f1c9a52-8b47-4d61-9c0e-2a7d5f4b1e83", name: "Meena Kumari", joined: "2026-08-30", lastSeen: "3d ago", profileCompletion: 100, initiatedBreakdown: { requested: 0, accepted: 2, declined: 0, cancelled: 0 },
    receivedBreakdown: { requested: 1, accepted: 0, declined: 0, cancelled: 0 },
    lifecycle: "New" },
  { id: "7a4e2d18-6c93-4f05-8b21-9e3c7a5d4f62", name: "Farhan Ali", joined: "2026-09-01", lastSeen: "2d ago", profileCompletion: 83, initiatedBreakdown: { requested: 1, accepted: 1, declined: 0, cancelled: 0 },
    receivedBreakdown: { requested: 0, accepted: 1, declined: 0, cancelled: 0 },
    lifecycle: "New" },
  { id: "c28b5f70-1d4a-4e96-a37c-5b8f2e6d9014", name: "Ramesh Yadav", joined: "2026-07-19", lastSeen: "6d ago", profileCompletion: 83, initiatedBreakdown: { requested: 1, accepted: 1, declined: 1, cancelled: 0 },
    receivedBreakdown: { requested: 0, accepted: 2, declined: 0, cancelled: 0 },
    lifecycle: "Active" },
  { id: "e91d3c46-2f58-4a7b-9d80-6c1a4e5b7f23", name: "Pooja Sharma", joined: "2026-06-28", lastSeen: "4d ago", profileCompletion: 100, initiatedBreakdown: { requested: 0, accepted: 3, declined: 1, cancelled: 0 },
    receivedBreakdown: { requested: 1, accepted: 2, declined: 0, cancelled: 0 },
    lifecycle: "Active" },
  { id: "5b7f8a20-9e13-4c62-b48d-1f7c3a9e6d54", name: "Anil Kumar", joined: "2026-05-14", lastSeen: "45d ago", profileCompletion: 67, initiatedBreakdown: { requested: 1, accepted: 0, declined: 0, cancelled: 0 },
    receivedBreakdown: { requested: 0, accepted: 0, declined: 0, cancelled: 0 },
    lifecycle: "At Risk" },
  { id: "a4c6e832-7b15-49df-8e02-3d5f9c1b7a68", name: "Sunita Devi", joined: "2026-04-22", lastSeen: "61d ago", profileCompletion: 50, initiatedBreakdown: { requested: 0, accepted: 0, declined: 1, cancelled: 0 },
    receivedBreakdown: { requested: 0, accepted: 0, declined: 0, cancelled: 1 },
    lifecycle: "At Risk" },
  { id: "9d2f7b64-3a08-4c15-9e7b-8f4a6c2d5013", name: "Lakshmi Narayan", joined: "2026-02-10", lastSeen: "4mo ago", profileCompletion: 67, initiatedBreakdown: { requested: 0, accepted: 0, declined: 0, cancelled: 1 },
    receivedBreakdown: { requested: 0, accepted: 0, declined: 0, cancelled: 0 },
    lifecycle: "Inactive" },
  { id: "6e83a1d9-5c47-4b20-8f36-2a9d7e4c1b05", name: "Vikram Singh", joined: "2026-01-27", lastSeen: "6mo ago", profileCompletion: 33, initiatedBreakdown: { requested: 0, accepted: 0, declined: 0, cancelled: 0 },
    receivedBreakdown: { requested: 0, accepted: 0, declined: 0, cancelled: 0 },
    lifecycle: "Inactive" },
];

const SEEKER_SUMMARY: ParticipantSummary = {
  profilesRegistered: 8,
  profilesComplete: 2,
  receivedConnections: 8,
  totalAccountHolders: 6,
  avgProfilesPerUser: 1.3,
  avgActionsPerUser: 3.1,
};

export function getSeekerParticipants(): Participant[] {
  return SEEKERS.map(withTotals);
}

export function getSeekerSummary(): ParticipantSummary {
  return { ...SEEKER_SUMMARY };
}

export interface UserMetrics {
  receivedConnections: number;
  totalAccountHolders: number;
  avgProfilesPerUser: number;
  avgActionsPerUser: number;
}

export function getUserMetrics(
  programId: "seekers" | "providers",
  _participants: Participant[],
): UserMetrics {
  const s = programId === "providers" ? PROVIDER_SUMMARY : SEEKER_SUMMARY;
  return {
    receivedConnections: s.receivedConnections,
    totalAccountHolders: s.totalAccountHolders,
    avgProfilesPerUser: s.avgProfilesPerUser,
    avgActionsPerUser: s.avgActionsPerUser,
  };
}
