export type Lifecycle = "New" | "Active" | "At Risk" | "Inactive";

export interface Participant {
  id: string;
  name: string;
  joined: string;
  lastSeen: string;
  profileCompletion: number;
  initiated: number;
  received: number;
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

const PROVIDERS: Participant[] = [
  {
    id: "b95ad20c-7ff2-4ba9-9c84-fc17c667276e",
    name: "Sahyog Foundation",
    joined: "2026-07-13",
    lastSeen: "8d ago",
    profileCompletion: 100,
    initiated: 1,
    received: 2,
    lifecycle: "Inactive",
  },
  {
    id: "45cc89e3-ffd0-43d9-8314-f1a425ae2a80",
    name: "Test Service Provider",
    joined: "2026-08-28",
    lastSeen: "8d ago",
    profileCompletion: 67,
    initiated: 0,
    received: 0,
    lifecycle: "Inactive",
  },
  {
    id: "d458f423-ecfe-47cf-9a4d-d49f9728537a",
    name: "ABCD ltd",
    joined: "2026-07-23",
    lastSeen: "1mo ago",
    profileCompletion: 100,
    initiated: 1,
    received: 1,
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

export function getProviderParticipants(): Participant[] {
  return PROVIDERS.map((p) => ({ ...p }));
}

export function getProviderSummary(): ParticipantSummary {
  return { ...PROVIDER_SUMMARY };
}

export function getStaticUserMetrics(
  _programId: "seekers" | "providers",
): Pick<
  ParticipantSummary,
  "receivedConnections" | "totalAccountHolders" | "avgProfilesPerUser" | "avgActionsPerUser"
> {
  const {
    receivedConnections,
    totalAccountHolders,
    avgProfilesPerUser,
    avgActionsPerUser,
  } = PROVIDER_SUMMARY;
  return { receivedConnections, totalAccountHolders, avgProfilesPerUser, avgActionsPerUser };
}
