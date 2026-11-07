// Row shapes for the Ecosystem View components.

/** A job post row shown in the Ecosystem View tables and drilldowns. */
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

/** A job application row shown in the Ecosystem View drilldowns. */
export interface Application {
  id: string;
  seeker_role: string;
  location: string;
  job_id: string;
  applied_date: string; // ISO
}
