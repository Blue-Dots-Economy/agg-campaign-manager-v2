import { pgTable, unique, check, uuid, text, boolean, timestamp, integer, smallint, index, date, numeric, jsonb, foreignKey, bigserial, primaryKey, pgView } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];



export const appUsers = pgTable("app_users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	email: text().notNull(),
	name: text(),
	role: text().notNull(),
	district: text(),
	program: text(),
	nodeType: text("node_type"),
	nodeName: text("node_name"),
	passwordHash: text("password_hash"),
	active: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	mustChangePassword: boolean("must_change_password").default(false).notNull(),
	failedLoginCount: integer("failed_login_count").default(0).notNull(),
	lockedUntil: timestamp("locked_until", { withTimezone: true, mode: 'string' }),
}, (table) => [
	unique("app_users_email_key").on(table.email),
	check("app_users_role_check", sql`role = ANY (ARRAY['admin'::text, 'jfc'::text, 'owner'::text, 'coordinator'::text, 'ecosystem'::text, 'user'::text])`),
]);

export const purpleDotsCalls = pgTable("purple_dots_calls", {
	callId: text("call_id").primaryKey().notNull(),
	callUuid: text("call_uuid").notNull(),
	batchId: text("batch_id"),
	campaignName: text("campaign_name"),
	agentId: text("agent_id"),
	agentName: text("agent_name"),
	persona: text(),
	channel: text(),
	contactReferenceType: text("contact_reference_type"),
	contactReference: text("contact_reference"),
	callDateIst: date("call_date_ist"),
	callDatetimeIst: timestamp("call_datetime_ist", { withTimezone: true, mode: 'string' }),
	callDurationSeconds: numeric("call_duration_seconds"),
	contactAttempts: integer("contact_attempts"),
	callStatus: text("call_status"),
	callAnswered: boolean("call_answered"),
	callEngaged: boolean("call_engaged"),
	callDroppedAbruptly: boolean("call_dropped_abruptly"),
	fullJourneyCompleted: boolean("full_journey_completed"),
	abandonedAtStage: text("abandoned_at_stage"),
	callbackRequested: text("callback_requested"),
	onBehalfOf: boolean("on_behalf_of"),
	demographicInfoShared: boolean("demographic_info_shared"),
	profileItemId: text("profile_item_id"),
	profileUserId: text("profile_user_id"),
	disabilityCategoryMapped: text("disability_category_mapped").array(),
	userUnsureDisability: boolean("user_unsure_disability"),
	userUnsureNeeds: boolean("user_unsure_needs"),
	solutionOptionMappedCategories: text("solution_option_mapped_categories").array(),
	missingSolutionEnablerMappedCategories: text("missing_solution_enabler_mapped_categories").array(),
	solutionOptionRelevance: text("solution_option_relevance"),
	solutionEnablersDiscussed: boolean("solution_enablers_discussed"),
	userUnsureSolutionOptions: boolean("user_unsure_solution_options"),
	updateProfileApiTriggered: boolean("update_profile_api_triggered"),
	updateProfileApiSuccessful: boolean("update_profile_api_successful"),
	matchingProvidersFound: integer("matching_providers_found"),
	connectProviderApiTriggered: boolean("connect_provider_api_triggered"),
	connectProviderApiSuccessful: boolean("connect_provider_api_successful"),
	providersConnected: integer("providers_connected"),
	callValueScore: numeric("call_value_score"),
	dropReason: text("drop_reason"),
	toolsUsed: text("tools_used").array(),
	testFlag: boolean("test_flag"),
	loadedAt: timestamp("loaded_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	contactId: text("contact_id"),
	sheetCallId: text("sheet_call_id"),
}, (table) => [
	index("purple_dots_calls_agent_idx").using("btree", table.agentId.asc().nullsLast().op("text_ops")),
	index("purple_dots_calls_contact_idx").using("btree", table.contactId.asc().nullsLast().op("text_ops")),
	index("purple_dots_calls_date_idx").using("btree", table.callDateIst.asc().nullsLast().op("date_ops")),
	index("purple_dots_calls_profile_idx").using("btree", table.profileItemId.asc().nullsLast().op("text_ops")),
	index("purple_dots_calls_sheet_idx").using("btree", table.sheetCallId.asc().nullsLast().op("text_ops")),
]);

export const campaignRequests = pgTable("campaign_requests", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	program: text().notNull(),
	agentId: text("agent_id").notNull(),
	agentName: text("agent_name"),
	batchName: text("batch_name").notNull(),
	campaignDay: text("campaign_day"),
	campaignDate: text("campaign_date"),
	campaignType: text("campaign_type"),
	region: text(),
	language: text(),
	cityCampaign: text("city_campaign"),
	channel: text().default('outbound'),
	source: text(),
	cohortIntent: text("cohort_intent"),
	cohortFilters: jsonb("cohort_filters").$type<Json>(),
	contacts: jsonb().$type<Json>().default([]).notNull(),
	contactCount: integer("contact_count").default(0).notNull(),
	schedule: jsonb().$type<Json>(),
	concurrency: integer(),
	maxRetries: integer("max_retries"),
	retryAfterHrs: integer("retry_after_hrs"),
	selectedStatuses: jsonb("selected_statuses").$type<Json>(),
	requestedBy: text("requested_by"),
	status: text().default('pending').notNull(),
	reviewerEmail: text("reviewer_email"),
	declineReason: text("decline_reason"),
	batchId: text("batch_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	note: text(),
});

export const launchedBatchInputs = pgTable("launched_batch_inputs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	batchId: text("batch_id").notNull(),
	program: text().notNull(),
	normalizedPhone: text("normalized_phone").notNull(),
	contactName: text("contact_name"),
	recommendations: text(),
	userIntent: text("user_intent"),
	raw: jsonb().$type<Json>().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("launched_batch_inputs_batch_id_normalized_phone_key").on(table.batchId, table.normalizedPhone),
]);

export const launchedBatches = pgTable("launched_batches", {
	batchId: text("batch_id").primaryKey().notNull(),
	program: text().notNull(),
	agentId: text("agent_id"),
	agentName: text("agent_name"),
	batchName: text("batch_name"),
	campaignDay: text("campaign_day"),
	campaignDate: text("campaign_date"),
	campaignType: text("campaign_type"),
	language: text(),
	cityCampaign: text("city_campaign"),
	region: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const programAgents = pgTable("program_agents", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	program: text().notNull(),
	agentId: text("agent_id").notNull(),
	name: text().default("").notNull(),
	status: text().default('unknown').notNull(),
	lastError: text("last_error"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("program_agents_program_agent_id_key").on(table.program, table.agentId),
	check("program_agents_program_check", sql`program = ANY (ARRAY['seekers'::text, 'providers'::text])`),
]);

export const programExportTargets = pgTable("program_export_targets", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	program: text().notNull(),
	sheetId: text("sheet_id").default("").notNull(),
	tabName: text("tab_name"),
	label: text(),
	enabled: boolean().default(true).notNull(),
	lastExportedAt: timestamp("last_exported_at", { withTimezone: true, mode: 'string' }),
	lastError: text("last_error"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("program_export_targets_program_key").on(table.program),
]);

export const programSyncState = pgTable("program_sync_state", {
	program: text().primaryKey().notNull(),
	lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: 'string' }),
	rowCount: integer("row_count").default(0).notNull(),
	status: text().default('idle').notNull(),
	lastError: text("last_error"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const reviewers = pgTable("reviewers", {
	email: text().primaryKey().notNull(),
	addedAt: timestamp("added_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const sheetConnections = pgTable("sheet_connections", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	program: text().notNull(),
	name: text().notNull(),
	sheetId: text("sheet_id").notNull(),
	tabName: text("tab_name"),
	enabled: boolean().default(true).notNull(),
	status: text().default('unknown').notNull(),
	rowCount: integer("row_count"),
	lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastError: text("last_error"),
	channel: text().default('outbound').notNull(),
}, (table) => [
	check("sheet_connections_program_check", sql`program = ANY (ARRAY['seekers'::text, 'providers'::text])`),
]);

export const transcriptReviews = pgTable("transcript_reviews", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	jobId: text("job_id"),
	callId: text("call_id"),
	reviewerName: text("reviewer_name"),
	reviewerEmail: text("reviewer_email"),
	companyName: text("company_name"),
	campaignDay: text("campaign_day"),
	campaignType: text("campaign_type"),
	language: text(),
	cityCampaign: text("city_campaign"),
	contactPhone: text("contact_phone"),
	callOutcome: text("call_outcome"),
	jobStatusInMaster: text("job_status_in_master"),
	reviewType: text("review_type"),
	quantitativeIssues: text("quantitative_issues"),
	turnFlags: text("turn_flags"),
	overallRating: integer("overall_rating"),
	reviewerNotes: text("reviewer_notes"),
	summaryMatch: text("summary_match"),
	jobStatusCorrect: text("job_status_correct"),
	outputFieldsAccurate: text("output_fields_accurate"),
	dataset: text(),
});

export const purpleDotsConnections = pgTable("purple_dots_connections", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	callId: text("call_id").notNull(),
	seekerItemId: text("seeker_item_id"),
	providerItemId: text("provider_item_id").notNull(),
	actingAsUserId: text("acting_as_user_id"),
	providerInstanceUrl: text("provider_instance_url"),
	consentAcknowledged: boolean("consent_acknowledged"),
	consentVersion: integer("consent_version"),
	loadedAt: timestamp("loaded_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("purple_dots_connections_provider_idx").using("btree", table.providerItemId.asc().nullsLast().op("text_ops")),
	index("purple_dots_connections_seeker_idx").using("btree", table.seekerItemId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.callId],
			foreignColumns: [purpleDotsCalls.callId],
			name: "purple_dots_connections_call_id_fkey"
		}).onDelete("cascade"),
	unique("purple_dots_connections_call_id_provider_item_id_key").on(table.callId, table.providerItemId),
]);

export const northStarConfig = pgTable("north_star_config", {
	program: text().notNull(),
	key: text().notNull(),
	threshold: numeric(),
	enabled: boolean().default(true).notNull(),
	sort: integer().default(0).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	primaryKey({ columns: [table.program, table.key], name: "north_star_config_pkey"}),
]);
export const upSeekersUpload = pgTable("up_seekers_upload", {
	id: smallint().default(1).primaryKey().notNull(),
	csv: text().notNull(),
	fileName: text("file_name").notNull(),
	rowCount: integer("row_count").notNull(),
	uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	check("up_seekers_upload_single_row", sql`id = 1`),
]);

export const callRows = pgView("call_rows", {	id: uuid(),
	program: text(),
	connectionId: uuid("connection_id"),
	callId: text("call_id"),
	campaignDay: text("campaign_day"),
	intentScore: numeric("intent_score"),
	data: jsonb().$type<Json>(),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }),
	callAnswered: boolean("call_answered"),
	callEngaged: boolean("call_engaged"),
	appliedToJob: boolean("applied_to_job"),
	callStatus: text("call_status"),
	jobStatus: text("job_status"),
	newJobPosted: text("new_job_posted"),
	talentInsightsShown: text("talent_insights_shown"),
	phasesReached: text("phases_reached"),
	dropReason: text("drop_reason"),
	callOutcome: text("call_outcome"),
	cityCampaign: text("city_campaign"),
	campaignDate: text("campaign_date"),
	campaignType: text("campaign_type"),
	language: text(),
	phone: text(),
	callDurationSeconds: numeric("call_duration_seconds"),
	applicationsCount: numeric("applications_count"),
	triedToApply: boolean("tried_to_apply"),
	channel: text(),
	rowHash: text("row_hash"),
}).as(sql`SELECT md5(COALESCE(NULLIF(call_id, ''::text), NULLIF(call_uuid, ''::text), call_datetime_ist::text))::uuid AS id, CASE WHEN lower(COALESCE(persona, ''::text)) = ANY (ARRAY['provider'::text, 'providers'::text]) THEN 'providers'::text ELSE 'seekers'::text END AS program, NULL::uuid AS connection_id, COALESCE(NULLIF(call_id, ''::text), NULLIF(call_uuid, ''::text), ''::text) AS call_id, COALESCE(call_date_ist::text, ''::text) AS campaign_day, call_value_score AS intent_score, jsonb_build_object('call_id', call_id, 'phone', COALESCE(NULLIF(contact_id, ''::text), call_id), 'campaign_day', call_date_ist::text, 'campaign_date', call_date_ist::text, 'campaign_type', campaign_name, 'city_campaign', NULL::text, 'language', NULL::text, 'call_language', NULL::text, 'call_datetime_ist', call_datetime_ist, 'call_duration_seconds', call_duration_seconds, 'call_answered', call_answered, 'call_engaged', call_engaged, 'call_outcome', call_status, 'drop_reason', NULLIF(btrim(drop_reason), ''::text), 'counselled', solution_enablers_discussed, 'applied_to_job', COALESCE(providers_connected, 0) > 0, 'applications_count', providers_connected, 'tried_to_apply', connect_provider_api_triggered, 'jobs_recommended', matching_providers_found, 'jobs_shown', matching_providers_found, 'jobs_applied', providers_connected, 'jobs_failed_to_apply', NULL::text, 'interview_scheduled', NULL::text, 'Intent Score', call_value_score, 'Intent Score Reasoning', NULL::text, 'primary_topic', NULL::text, 'seeker_name', NULL::text, 'user_intent', NULL::text, 'final_summary', NULL::text, 'call_transcript', NULL::text, 'call_recording_url', NULL::text, 'raw', to_jsonb(c.*)) AS data, COALESCE(loaded_at, now()) AS synced_at, call_answered, call_engaged, COALESCE(providers_connected, 0) > 0 AS applied_to_job, call_status, NULL::text AS job_status, NULL::text AS new_job_posted, NULL::text AS talent_insights_shown, pd_norm_stage(abandoned_at_stage) AS phases_reached, NULLIF(btrim(drop_reason), ''::text) AS drop_reason, call_status AS call_outcome, NULL::text AS city_campaign, call_date_ist::text AS campaign_date, COALESCE(NULLIF(campaign_name, ''::text), 'Unattributed'::text) AS campaign_type, NULL::text AS language, COALESCE(NULLIF(contact_id, ''::text), call_id) AS phone, call_duration_seconds, providers_connected::numeric AS applications_count, connect_provider_api_triggered AS tried_to_apply, lower(COALESCE(NULLIF(channel, ''::text), 'outbound'::text)) AS channel, md5(to_jsonb(c.*)::text) AS row_hash FROM purple_dots_calls c WHERE COALESCE(test_flag, false) = false`);