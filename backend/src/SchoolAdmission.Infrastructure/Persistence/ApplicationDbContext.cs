using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Domain.Entities;
using SchoolAdmission.Infrastructure.Persistence.Configurations;

namespace SchoolAdmission.Infrastructure.Persistence;

public class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options)
    {
    }

    public DbSet<ClassRoom> Classes => Set<ClassRoom>();
    public DbSet<SeatHold> Holds => Set<SeatHold>();
    public DbSet<PortalUser> Users => Set<PortalUser>();
    public DbSet<AccountToken> AccountTokens => Set<AccountToken>();
    public DbSet<AdmissionDocument> Documents => Set<AdmissionDocument>();
    public DbSet<AdmissionPayment> Payments => Set<AdmissionPayment>();
    public DbSet<NotificationMessage> Notifications => Set<NotificationMessage>();
    public DbSet<PortalAudit> Audit => Set<PortalAudit>();
    public DbSet<AdmissionFee> Fees => Set<AdmissionFee>();
    public DbSet<AdmissionApplication> Applications => Set<AdmissionApplication>();
    public DbSet<ApplicationDocument> ApplicationDocuments => Set<ApplicationDocument>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfiguration(new ClassRoomConfiguration());
        modelBuilder.ApplyConfiguration(new SeatHoldConfiguration());
        modelBuilder.Entity<PortalUser>().HasIndex(x => x.Email).IsUnique();
        modelBuilder.Entity<PortalUser>().HasIndex(x => x.BirthRegistration).IsUnique();
        modelBuilder.Entity<AdmissionFee>().HasKey(x => x.ClassId);
        modelBuilder.Entity<AdmissionFee>().Property(x => x.Amount).HasPrecision(12, 2);
        modelBuilder.Entity<AdmissionFee>().HasOne<ClassRoom>().WithOne().HasForeignKey<AdmissionFee>(x => x.ClassId);
        modelBuilder.Entity<AdmissionPayment>().Property(x => x.Amount).HasPrecision(12, 2);
        modelBuilder.Entity<AdmissionPayment>().HasIndex(x => x.ValidationId).IsUnique();
        modelBuilder.Entity<AdmissionPayment>().HasIndex(x => x.HoldId).IsUnique();
        modelBuilder.Entity<AdmissionPayment>().HasOne<SeatHold>().WithMany().HasForeignKey(x => x.HoldId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<AccountToken>().HasOne<PortalUser>().WithMany().HasForeignKey(x => x.UserId);
        modelBuilder.Entity<AdmissionDocument>().HasOne<PortalUser>().WithMany().HasForeignKey(x => x.UserId);
        modelBuilder.Entity<AdmissionPayment>().HasOne<PortalUser>().WithMany().HasForeignKey(x => x.UserId);
        modelBuilder.Entity<NotificationMessage>().HasIndex(x => new { x.SentAt, x.NextAttemptAt });
        modelBuilder.Entity<AdmissionDocument>().HasIndex(x => new { x.UserId, x.Kind });
        modelBuilder.Entity<AdmissionApplication>().HasIndex(x => new { x.UserId, x.ClassId }).IsUnique();
        modelBuilder.Entity<AdmissionApplication>().HasIndex(x => new { x.Status, x.SubmittedAt });
        modelBuilder.Entity<AdmissionApplication>().HasOne<PortalUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<AdmissionApplication>().HasOne<ClassRoom>().WithMany().HasForeignKey(x => x.ClassId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<ApplicationDocument>().HasKey(x => new { x.ApplicationId, x.Kind });
        modelBuilder.Entity<AdmissionApplication>().HasMany(x => x.Documents).WithOne().HasForeignKey(x => x.ApplicationId);
        modelBuilder.Entity<ApplicationDocument>().HasOne<AdmissionDocument>().WithMany().HasForeignKey(x => x.DocumentId).OnDelete(DeleteBehavior.Restrict);
    }
}

