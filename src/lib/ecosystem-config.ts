// Region → sheet mapping for the Ecosystem View.
// Tab names below are the detected primary tabs; the server module still falls
// back to auto-detect if a workbook is re-arranged.
export interface RegionConfig {
  state: string;
  districts: string[];
  jobsSheet: string;
  jobsTab: string; // OPEN_ROLES-style tab
  applicationsTab: string; // job_application tab
  seekerSheet: string;
  seekerTab: string; // seeker_profile tab
}

export const REGION_CONFIGS: Record<string, RegionConfig> = {
  KA: {
    state: "KA",
    districts: ["Hubli", "Belgavi"],
    jobsSheet: "1ivktbvMI7EasBta7CNmRA6LOc6N4y4AUXqyyFXizoZU",
    jobsTab: "OPEN_ROLES",
    applicationsTab: "job_application",
    seekerSheet: "1N4fzt9ONsSyE7cCRglwGBxge-GWybN7cCq1PLMCrrbk",
    seekerTab: "seeker_profile",
  },
  UP: {
    state: "UP",
    districts: ["Ghaziabad"],
    // UP_B is the jobs workbook (OPEN_ROLES + job_application).
    jobsSheet: "1gbuBqb8-T48mHe2xteAZK1qDhOaPVJzYCWQQT1MOXEQ",
    jobsTab: "OPEN_ROLES",
    applicationsTab: "job_application",
    // UP_A is the seekers workbook.
    seekerSheet: "1J2WDeSOCaIVz2KvWMmI9dVE4iTh_Dqbt8Aqb6423a2U",
    seekerTab: "seeker_profile",
  },
};

export const REGION_TREE = Object.values(REGION_CONFIGS).map((r) => ({
  state: r.state,
  districts: r.districts,
}));
