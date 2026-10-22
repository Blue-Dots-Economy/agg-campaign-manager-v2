ALTER TABLE "app_users" ALTER COLUMN "role" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "last_failed_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "keycloak_sub" text;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_keycloak_sub_key" UNIQUE("keycloak_sub");--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_active_needs_role" CHECK ((NOT active) OR role IS NOT NULL);