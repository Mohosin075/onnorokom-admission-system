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
            .HasMaxLength(64)
            .IsRequired();

        builder.Property(h => h.ClassId)
            .HasMaxLength(64)
            .IsRequired();

        builder.Property(h => h.StudentId)
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(h => h.Status)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(h => h.CreatedAtUtc)
            .IsRequired();

        builder.Property(h => h.ExpiresAtUtc)
            .IsRequired();

        builder.Property(h => h.ConfirmedAtUtc);
        builder.Property(h => h.CancelledAtUtc);

        // Performance & Query Optimization Indexes
        builder.HasIndex(h => h.StudentId);
        builder.HasIndex(h => new { h.ClassId, h.Status, h.ExpiresAtUtc });
        builder.HasIndex(h => new { h.StudentId, h.ClassId });
    }
}

