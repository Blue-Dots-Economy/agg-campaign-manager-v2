CREATE TABLE "admin_actions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"email" text NOT NULL,
	"keycloak_user_id" text,
	"operator" text NOT NULL,
	CONSTRAINT "admin_actions_action_check" CHECK (action = ANY (ARRAY['create_admin'::text, 'promote'::text, 'relink'::text, 'verify_email'::text]))
);
--> statement-breakpoint
ALTER TABLE "app_users" ALTER COLUMN "role" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "keycloak_sub" text;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_keycloak_sub_key" UNIQUE("keycloak_sub");--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_active_needs_role" CHECK ((NOT active) OR role IS NOT NULL);