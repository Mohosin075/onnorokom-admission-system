using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SchoolAdmission.Domain.Entities;

namespace SchoolAdmission.Infrastructure.Persistence.Configurations;

public class ClassRoomConfiguration : IEntityTypeConfiguration<ClassRoom>
{
    public void Configure(EntityTypeBuilder<ClassRoom> builder)
    {
        builder.ToTable("classes");

        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id)
            .HasMaxLength(64)
            .IsRequired();

        builder.Property(c => c.Name)
            .HasMaxLength(200)
            .IsRequired();

        builder.Property(c => c.TotalSeats)
            .IsRequired();

        builder.Property(c => c.CreatedAtUtc)
            .IsRequired();

        builder.HasMany(c => c.Holds)
            .WithOne(h => h.ClassRoom)
            .HasForeignKey(h => h.ClassId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
