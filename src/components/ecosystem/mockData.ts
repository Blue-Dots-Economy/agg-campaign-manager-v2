// Mock data for the Ecosystem View. Shape mirrors intended Supabase columns so a
// Phase-3 swap is drop-in.

export interface JobPost {
  id: string;
  title: string;
  category: string;
  sector: string;
  partial_fit_seekers: number;
  right_fit_seekers: number;
  area: string;
  current_openings: number;
  applications: number;
  status: "open" | "closed";
  posted_date: string; // ISO
  posted_by: string; // company
  salary_offered: number;
  shortlisted: number;
  application_pending_from: string;
  recommended_action_provider: string;
  recommended_action_seeker: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  location_district: string;
  location_state: string;
}

export interface Application {
  id: string;
  seeker_role: string;
  location: string;
  job_id: string;
  applied_date: string; // ISO
}

export interface Seeker {
  id: string;
  user_id: string;
  name: string;
  area: string;
  role: string;
  category: string;
  experience: string;
  qualification: string;
  trade: string;
  expected_salary: number;
  skills: string;
  age: number;
  organization_name: string;
  institution_name: string;
  location_district: string;
  location_state: string;
}

export interface RegionKey {
  state: string; // e.g. "UP"
  district: string; // e.g. "Ghaziabad"
}

// --- helpers ---
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

const pick = <T,>(arr: T[], i: number) => arr[i % arr.length];

const ROLES = [
  "Welder",
  "Electrician",
  "Data Entry Operator",
  "Delivery Associate",
  "Sales Executive",
  "Machine Operator",
  "Tailor",
  "Security Guard",
  "Fitter",
  "Warehouse Associate",
];

const ROLE_FIT: Record<string, { partial: number[]; right: number[] }> = {
  Welder:              { partial: [14, 11, 17, 9],   right: [6, 4, 8, 5] },
  Electrician:         { partial: [22, 18, 25, 20],  right: [11, 9, 13, 10] },
  "Data Entry Operator": { partial: [31, 28, 35, 26], right: [15, 12, 18, 14] },
  "Delivery Associate": { partial: [42, 38, 47, 35], right: [21, 19, 24, 17] },
  "Sales Executive":   { partial: [27, 23, 30, 25],  right: [12, 10, 14, 11] },
  "Machine Operator":  { partial: [9, 7, 12, 8],    right: [3, 5, 4, 6] },
  Tailor:              { partial: [16, 13, 19, 15],  right: [7, 5, 9, 6] },
  "Security Guard":    { partial: [38, 33, 44, 30],  right: [19, 16, 22, 14] },
  Fitter:              { partial: [12, 10, 15, 8],   right: [5, 4, 7, 3] },
  "Warehouse Associate": { partial: [24, 20, 28, 22], right: [10, 8, 12, 9] },
};

const CATEGORIES = [
  "Manufacturing",
  "Logistics",
  "Retail",
  "Textile",
  "Services",
  "Construction",
];

const SECTORS = ["Blue-Collar", "Grey-Collar", "White-Collar"];

const COMPANIES_UP = [
  "Reliance Retail",
  "Havells India",
  "Tata Motors",
  "Amazon India",
  "Flipkart Logistics",
  "Delhivery",
  "SIS Security",
  "Raymond Textiles",
  "Bajaj Auto",
  "Godrej Interio",
];

const COMPANIES_KA = [
  "Toyota Kirloskar",
  "Wipro Enterprises",
  "TVS Motors",
  "Bosch India",
  "Manyavar",
  "BigBasket",
  "Swiggy Instamart",
  "Kirloskar Brothers",
  "MRF Tyres",
  "ITC Ltd",
];

const AREAS_UP: Record<string, string[]> = {
  Ghaziabad: ["Vasundhara", "Indirapuram", "Kavi Nagar", "Sahibabad", "Loni", "Modinagar"],
};

const AREAS_KA: Record<string, string[]> = {
  Hubli: ["Vidyanagar", "Gokul Road", "Keshwapur", "Navanagar", "Unkal"],
  Belgavi: ["Tilakwadi", "Camp", "Shahapur", "Angol", "Vadgaon"],
};

const ACTIONS_PROVIDER = [
  "Reshare posting on WhatsApp",
  "Increase salary band",
  "Widen radius to 20km",
  "Call shortlisted candidates",
  "Extend deadline by 7 days",
];

const ACTIONS_SEEKER = [
  "Notify matched profiles",
  "Recommend to fresh signups",
  "Boost in feed for 48h",
  "Trigger SMS campaign",
  "Retarget dropped applicants",
];

const INSTITUTIONS_UP = [
  "Govt ITI Ghaziabad",
  "Govt ITI Modinagar",
  "Sunrise Pvt ITI",
  "IEC College of Engineering",
  "KRV Pvt Skill Institute",
  "",
  "Govt Polytechnic Ghaziabad",
];

const INSTITUTIONS_KA = [
  "Govt ITI Hubli",
  "Govt ITI Belgavi",
  "KLE Technological University",
  "Deshpande Skilling Pvt Ltd",
  "Rani Chennamma Pvt Institute",
  "",
  "Govt Polytechnic Hubli",
];

const ORGS = ["", "Skill India Mission", "NSDC", "PMKVY Centre", "State Rural Livelihoods Mission"];
const QUALIFICATIONS = ["10th Pass", "12th Pass", "ITI", "Diploma", "Graduate"];
const TRADES = ["Welder", "Electrician", "Fitter", "COPA", "Mechanic", "—"];
const EXPERIENCE_BUCKETS = ["Fresher", "0-1 yrs", "1-3 yrs", "3-5 yrs", "5+ yrs"];
const PENDING_FROM = ["Provider", "Seeker", "Shortlist review", "Interview scheduling"];

function buildRegion(
  state: string,
  district: string,
  companies: string[],
  areas: string[],
  institutions: string[],
  seedOffset: number
): { jobs: JobPost[]; applications: Application[]; seekers: Seeker[] } {
  const jobs: JobPost[] = [];
  const jobCount = 24;
  for (let i = 0; i < jobCount; i++) {
    const role = pick(ROLES, i + seedOffset);
    const openings = 3 + ((i * 7 + seedOffset) % 15); // 3-17
    // Vary applications so all gap bands appear.
    const gapPattern = [8, 5, 3, 1, 0, -2, 6, 2, 0, -1, 4, 1];
    const gap = pick(gapPattern, i + seedOffset);
    const applications = Math.max(0, openings - gap);
    const area = pick(areas, i + seedOffset);
    const fit = ROLE_FIT[role] ?? { partial: [6, 8, 10], right: [3, 4, 5] };
    const partial = fit.partial[(i + seedOffset) % fit.partial.length];
    const right = fit.right[(i + seedOffset) % fit.right.length];
    const postedAgo = (i * 5 + seedOffset) % 45;
    const id = `${state}-JOB-${i + 1}`;
    jobs.push({
      id,
      title: role,
      category: pick(CATEGORIES, i + seedOffset),
      sector: pick(SECTORS, i + seedOffset),
      partial_fit_seekers: partial,
      right_fit_seekers: right,
      area,
      current_openings: openings,
      applications,
      status: i % 11 === 0 ? "closed" : "open",
      posted_date: daysAgo(postedAgo),
      posted_by: pick(companies, i + seedOffset),
      salary_offered: 12000 + ((i * 1500 + seedOffset * 500) % 30000),
      shortlisted: Math.min(applications, Math.floor(applications / 3)),
      application_pending_from: pick(PENDING_FROM, i + seedOffset),
      recommended_action_provider: pick(ACTIONS_PROVIDER, i + seedOffset),
      recommended_action_seeker: pick(ACTIONS_SEEKER, i + seedOffset),
      contact_name: `Contact ${i + 1}`,
      contact_phone: `9${(800000000 + i * 137 + seedOffset).toString().slice(0, 9)}`,
      contact_email: `hr${i + 1}@${pick(companies, i + seedOffset).toLowerCase().replace(/[^a-z]/g, "")}.co.in`,
      location_district: district,
      location_state: state,
    });
  }
  // Duplicates: two jobs w/ same title+company+area+openings
  if (jobs.length >= 3) {
    const src = jobs[0];
    jobs.push({
      ...src,
      id: `${state}-JOB-DUP-1`,
      posted_date: daysAgo(2),
    });
    jobs.push({
      ...src,
      id: `${state}-JOB-DUP-2`,
      posted_date: daysAgo(10),
    });
  }

  const applications: Application[] = [];
  let ac = 0;
  for (const j of jobs) {
    for (let k = 0; k < j.applications; k++) {
      // Spread applications across recent dates: some <7d, some 7-30d, some >30d.
      const ageDays = (k * 3 + ac * 7 + seedOffset) % 55;
      applications.push({
        id: `${state}-APP-${ac++}`,
        seeker_role: j.title,
        location: j.area,
        job_id: j.id,
        applied_date: daysAgo(ageDays),
      });
    }
  }

  const seekers: Seeker[] = [];
  const seekerCount = 72;
  const firstNames = ["Amit", "Priya", "Rahul", "Sunita", "Vikas", "Anjali", "Rakesh", "Meena", "Suresh", "Kavita"];
  const lastNames = ["Sharma", "Kumar", "Patel", "Verma", "Singh", "Gupta", "Yadav", "Naik", "Rao", "Reddy"];
  for (let i = 0; i < seekerCount; i++) {
    seekers.push({
      id: `${state}-SEK-${i + 1}`,
      user_id: `${state}-USR-${Math.floor(i / 1.2) + 1}`,
      name: `${pick(firstNames, i + seedOffset)} ${pick(lastNames, i * 3 + seedOffset)}`,
      area: pick(areas, i + seedOffset),
      role: pick(ROLES, i + seedOffset),
      category: pick(CATEGORIES, i + seedOffset),
      experience: pick(EXPERIENCE_BUCKETS, i + seedOffset),
      qualification: pick(QUALIFICATIONS, i + seedOffset),
      trade: pick(TRADES, i + seedOffset),
      expected_salary: 10000 + ((i * 1200 + seedOffset * 300) % 25000),
      skills: [pick(ROLES, i), pick(TRADES, i + 2)].filter((s) => s && s !== "—").join(", "),
      age: 19 + ((i * 3 + seedOffset) % 20),
      organization_name: pick(ORGS, i + seedOffset),
      institution_name: pick(institutions, i + seedOffset),
      location_district: district,
      location_state: state,
    });
  }
  return { jobs, applications, seekers };
}

const upGzb = buildRegion("UP", "Ghaziabad", COMPANIES_UP, AREAS_UP.Ghaziabad, INSTITUTIONS_UP, 1);
const kaHub = buildRegion("KA", "Hubli", COMPANIES_KA, AREAS_KA.Hubli, INSTITUTIONS_KA, 7);
const kaBel = buildRegion("KA", "Belgavi", COMPANIES_KA, AREAS_KA.Belgavi, INSTITUTIONS_KA, 13);

export const MOCK_JOBS: JobPost[] = [...upGzb.jobs, ...kaHub.jobs, ...kaBel.jobs];
export const MOCK_APPLICATIONS: Application[] = [
  ...upGzb.applications,
  ...kaHub.applications,
  ...kaBel.applications,
];
export const MOCK_SEEKERS: Seeker[] = [...upGzb.seekers, ...kaHub.seekers, ...kaBel.seekers];

export const REGION_TREE: { state: string; districts: string[] }[] = [
  { state: "UP", districts: ["Ghaziabad"] },
  { state: "KA", districts: ["Hubli", "Belgavi"] },
];
