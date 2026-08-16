CREATE TYPE "public"."crop_cycle_status" AS ENUM('planned', 'growing', 'harvested', 'failed');--> statement-breakpoint
CREATE TYPE "public"."observation_index" AS ENUM('ndvi', 'ndre', 'ndwi', 'evi', 'true_color');--> statement-breakpoint
CREATE TYPE "public"."stress_classification" AS ENUM('soil_issue', 'low_vigor', 'pest', 'water_stress', 'unclassified');--> statement-breakpoint
CREATE TYPE "public"."stress_severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."task_activity" AS ENUM('watering', 'planting', 'fertilization', 'pest_control', 'harvesting');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'done');--> statement-breakpoint
CREATE TABLE "crops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" "citext" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crops_organization_id_slug_unique" UNIQUE("organization_id","slug"),
	CONSTRAINT "crops_organization_id_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "farms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"location" geography(Point,4326) NOT NULL,
	"timezone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "farms_organization_id_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "crop_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"crop_id" uuid NOT NULL,
	"planted_on" date NOT NULL,
	"expected_harvest_on" date NOT NULL,
	"status" "crop_cycle_status" NOT NULL,
	"quantity_kg" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"farm_id" uuid NOT NULL,
	"name" text NOT NULL,
	"boundary" geography(MultiPolygon,4326) NOT NULL,
	"position" numeric NOT NULL,
	"last_refresh_at" timestamp with time zone,
	"last_refresh_succeeded_at" timestamp with time zone,
	"last_refresh_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fields_organization_id_farm_id_name_unique" UNIQUE("organization_id","farm_id","name"),
	CONSTRAINT "fields_organization_id_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"organization_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"captured_on" date NOT NULL,
	"index" "observation_index" NOT NULL,
	"stats" jsonb NOT NULL,
	"raster_key" text NOT NULL,
	"bbox" jsonb NOT NULL,
	"scene_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "observations_field_id_captured_on_index_pk" PRIMARY KEY("field_id","captured_on","index")
);
--> statement-breakpoint
CREATE TABLE "stress_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"geometry" geography(Polygon,4326) NOT NULL,
	"detected_on" date NOT NULL,
	"window_start" date NOT NULL,
	"window_end" date NOT NULL,
	"classification" "stress_classification" NOT NULL,
	"severity" "stress_severity" NOT NULL,
	"index_value" numeric NOT NULL,
	"muted_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subtasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"title" text NOT NULL,
	"done_at" timestamp with time zone,
	"position" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_assignees" (
	"organization_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "task_assignees_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"field_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" NOT NULL,
	"progress_pct" integer,
	"activity" "task_activity" NOT NULL,
	"starts_on" date,
	"due_on" date,
	"position" numeric NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_organization_id_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "crops" ADD CONSTRAINT "crops_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farms" ADD CONSTRAINT "farms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crop_cycles" ADD CONSTRAINT "crop_cycles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crop_cycles" ADD CONSTRAINT "crop_cycles_field_fk" FOREIGN KEY ("organization_id","field_id") REFERENCES "public"."fields"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crop_cycles" ADD CONSTRAINT "crop_cycles_crop_fk" FOREIGN KEY ("organization_id","crop_id") REFERENCES "public"."crops"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_farm_fk" FOREIGN KEY ("organization_id","farm_id") REFERENCES "public"."farms"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_field_fk" FOREIGN KEY ("organization_id","field_id") REFERENCES "public"."fields"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stress_zones" ADD CONSTRAINT "stress_zones_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stress_zones" ADD CONSTRAINT "stress_zones_field_fk" FOREIGN KEY ("organization_id","field_id") REFERENCES "public"."fields"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_task_fk" FOREIGN KEY ("organization_id","task_id") REFERENCES "public"."tasks"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_fk" FOREIGN KEY ("organization_id","task_id") REFERENCES "public"."tasks"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_membership_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_fk" FOREIGN KEY ("organization_id","task_id") REFERENCES "public"."tasks"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_fk" FOREIGN KEY ("organization_id","author_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Hand-corrected (TASK-domain-schema §1.1.4, §2.5): drizzle-kit generates
-- `ON DELETE set null` with no column list, which would try to null
-- organization_id too and fail — it is NOT NULL. PG16's column-list form
-- nulls only field_id, verified against a live PG16 instance.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_field_fk" FOREIGN KEY ("organization_id","field_id") REFERENCES "public"."fields"("organization_id","id") ON DELETE SET NULL ("field_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "farms_location_gist" ON "farms" USING gist ("location");--> statement-breakpoint
CREATE UNIQUE INDEX "crop_cycles_one_growing_per_field" ON "crop_cycles" USING btree ("field_id") WHERE status = 'growing';--> statement-breakpoint
CREATE INDEX "fields_boundary_gist" ON "fields" USING gist ("boundary");--> statement-breakpoint
CREATE INDEX "observations_org_field_index_captured_desc" ON "observations" USING btree ("organization_id","field_id","index","captured_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stress_zones_geometry_gist" ON "stress_zones" USING gist ("geometry");--> statement-breakpoint
CREATE INDEX "stress_zones_org_field_detected_desc" ON "stress_zones" USING btree ("organization_id","field_id","detected_on" DESC NULLS LAST) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "tasks_org_status_position" ON "tasks" USING btree ("organization_id","status","position");