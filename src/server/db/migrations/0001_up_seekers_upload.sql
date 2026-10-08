CREATE TABLE "up_seekers_upload" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"csv" text NOT NULL,
	"file_name" text NOT NULL,
	"row_count" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "up_seekers_upload_single_row" CHECK (id = 1)
);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "up_seekers_upload" TO cm_app;
