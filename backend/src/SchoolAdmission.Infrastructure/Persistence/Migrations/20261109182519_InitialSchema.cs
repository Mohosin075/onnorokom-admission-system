using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SchoolAdmission.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Adopt the original EnsureCreated schema without deleting existing admissions.
            migrationBuilder.Sql("""
                CREATE TABLE IF NOT EXISTS classes (
                    id varchar(64) NOT NULL CONSTRAINT "PK_classes" PRIMARY KEY,
                    name varchar(200) NOT NULL,
                    total_seats integer NOT NULL,
                    created_at_utc timestamptz NOT NULL
                );
                CREATE TABLE IF NOT EXISTS seat_holds (
                    id varchar(64) NOT NULL CONSTRAINT "PK_seat_holds" PRIMARY KEY,
                    class_id varchar(64) NOT NULL,
                    student_id varchar(32) NOT NULL,
                    status varchar(32) NOT NULL,
                    created_at_utc timestamptz NOT NULL,
                    expires_at_utc timestamptz NOT NULL,
                    confirmed_at_utc timestamptz NULL,
                    cancelled_at_utc timestamptz NULL,
                    CONSTRAINT "FK_seat_holds_classes_class_id" FOREIGN KEY (class_id)
                        REFERENCES classes(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS "IX_seat_holds_class_id_status_expires_at_utc"
                    ON seat_holds (class_id, status, expires_at_utc);
                CREATE INDEX IF NOT EXISTS "IX_seat_holds_student_id" ON seat_holds (student_id);
                CREATE INDEX IF NOT EXISTS "IX_seat_holds_student_id_class_id" ON seat_holds (student_id, class_id);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "seat_holds");

            migrationBuilder.DropTable(
                name: "classes");
        }
    }
}
