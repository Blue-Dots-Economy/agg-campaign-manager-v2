import { relations } from "drizzle-orm/relations";
import { purpleDotsCalls, purpleDotsConnections } from "./schema";

export const purpleDotsConnectionsRelations = relations(purpleDotsConnections, ({one}) => ({
	purpleDotsCall: one(purpleDotsCalls, {
		fields: [purpleDotsConnections.callId],
		references: [purpleDotsCalls.callId]
	}),
}));

export const purpleDotsCallsRelations = relations(purpleDotsCalls, ({many}) => ({
	purpleDotsConnections: many(purpleDotsConnections),
}));