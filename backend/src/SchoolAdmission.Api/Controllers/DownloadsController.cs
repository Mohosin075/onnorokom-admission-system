using System.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Portal;
using SchoolAdmission.Domain.Enums;
using SchoolAdmission.Infrastructure.Persistence;

namespace SchoolAdmission.Api.Controllers;

[ApiController, Authorize, Route("downloads")]
public class DownloadsController(ApplicationDbContext db, IConfiguration config) : ControllerBase
{
    [HttpGet("{holdId}/{kind}")]
    public async Task<IActionResult> Download(string holdId, string kind, CancellationToken ct)
    {
        if (kind is not ("receipt" or "admission-card")) return NotFound();
        var hold = await db.Holds.Include(x => x.ClassRoom).SingleOrDefaultAsync(x => x.Id == holdId && x.Status == HoldStatus.CONFIRMED, ct);
        if (hold == null) return NotFound();
        var user = await db.Users.SingleOrDefaultAsync(x => x.BirthRegistration == hold.StudentId && (x.Id == User.UserId() || User.IsInRole("Admin")), ct);
        if (user == null) return NotFound();
        var payment = await db.Payments.SingleOrDefaultAsync(x => x.HoldId == holdId && x.Status == "Paid", ct);
        if (payment == null) return NotFound();
        var institution = config["Portal:InstitutionName"];
        if (string.IsNullOrWhiteSpace(institution)) return StatusCode(503, new { message = "Institution details have not been configured." });
        static string E(string? value) => WebUtility.HtmlEncode(value) ?? "";
        var title = kind == "receipt" ? "Admission payment receipt" : "Admission card";
        const string style = "body{font:16px system-ui;color:#172033;max-width:760px;margin:60px auto;padding:24px}h1{font-size:28px}dl{display:grid;grid-template-columns:190px 1fr;gap:18px}dt{color:#556}dd{margin:0;overflow-wrap:anywhere}.badge{color:#08784a}footer{border-top:1px solid #ccc;margin-top:40px;padding-top:20px;font-size:12px}@media print{body{margin:0}}";
        var html = $"""
        <!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title>
        <style>{style}</style></head>
        <body><header><p>{E(institution)}</p><h1>{title}</h1><p class="badge">Admission confirmed · Payment verified</p></header><dl>
        <dt>Applicant</dt><dd>{E(user.FullName)}</dd><dt>Birth registration</dt><dd>{E(user.BirthRegistration)}</dd>
        <dt>Guardian</dt><dd>{E(user.GuardianName)}</dd><dt>Class / shift</dt><dd>{E(hold.ClassRoom?.Name)}</dd>
        <dt>Application reference</dt><dd>{E(hold.Id)}</dd><dt>Payment reference</dt><dd>{E(payment.Id)}</dd>
        <dt>Stripe reference</dt><dd>{E(payment.BankTransactionId)}</dd><dt>Amount paid</dt><dd>{payment.Amount:0.00} BDT</dd>
        <dt>Payment date (UTC)</dt><dd>{payment.PaidAt:yyyy-MM-dd HH:mm}</dd></dl>
        <footer>Generated from the institution's admission records. Use your browser's Print → Save as PDF to keep a PDF copy. Admission card confirms admission; it is not an examination admit card.</footer></body></html>
        """;
        Response.Headers.CacheControl = "no-store";
        Response.Headers.ContentDisposition = $"attachment; filename=\"{kind}-{holdId}.html\"";
        return Content(html, "text/html; charset=utf-8");
    }
}
