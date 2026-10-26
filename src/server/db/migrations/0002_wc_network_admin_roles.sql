ALTER TABLE "app_users" DROP CONSTRAINT "app_users_role_check";--> statement-breakpoint
-- JFC is renamed to WC (Working Committee); same access.
UPDATE "app_users" SET "role" = 'wc', "updated_at" = now() WHERE "role" = 'jfc';--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_role_check" CHECK (role = ANY (ARRAY['admin'::text, 'wc'::text, 'owner'::text, 'coordinator'::text, 'ecosystem'::text, 'network_admin'::text, 'user'::text]));