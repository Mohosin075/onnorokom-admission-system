using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SchoolAdmission.Domain.Entities;

namespace SchoolAdmission.Infrastructure.Persistence.Configurations;

public class SeatHoldConfiguration : IEntityTypeConfiguration<SeatHold>
{
    public void Configure(EntityTypeBuilder<SeatHold> builder)
    {
        builder.ToTable("seat_holds");

        builder.HasKey(h => h.Id);
        builder.Property(h => h.Id)
            .HasColumnName("id")
            .HasMaxLength(64)
            .IsRequired();

        builder.Property(h => h.ClassId)
            .HasColumnName("class_id")
            .HasMaxLength(64)
            .IsRequired();

        builder.Property(h => h.StudentId)
            .HasColumnName("student_id")
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(h => h.Status)
            .HasColumnName("status")
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(h => h.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        builder.Property(h => h.ExpiresAtUtc)
            .HasColumnName("expires_at_utc")
            .IsRequired();

        builder.Property(h => h.ConfirmedAtUtc)
            .HasColumnName("confirmed_at_utc");

        builder.Property(h => h.CancelledAtUtc)
            .HasColumnName("cancelled_at_utc");

        // Performance & Query Optimization Indexes
        builder.HasIndex(h => h.StudentId);
        builder.HasIndex(h => new { h.ClassId, h.Status, h.ExpiresAtUtc });
        builder.HasIndex(h => new { h.StudentId, h.ClassId });
    }
}
