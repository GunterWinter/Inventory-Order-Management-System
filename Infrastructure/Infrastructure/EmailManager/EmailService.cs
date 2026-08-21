using Application.Common.Services.EmailManager;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;

namespace Infrastructure.EmailManager;


public class EmailService : IEmailService
{
    private readonly ILogger<EmailService> _logger;
    private readonly SmtpSettings _smtpSettings;

    public EmailService(ILogger<EmailService> logger, IOptions<SmtpSettings> smtpSettings)
    {
        _logger = logger;
        _smtpSettings = smtpSettings.Value;
    }

    public async Task SendEmailAsync(string email, string subject, string htmlMessage)
    {
        try
        {
            var smtpHost = _smtpSettings.Host
                ?? throw new InvalidOperationException("SMTP host is not configured.");
            var smtpUserName = _smtpSettings.UserName
                ?? throw new InvalidOperationException("SMTP user name is not configured.");
            var smtpPassword = _smtpSettings.Password
                ?? throw new InvalidOperationException("SMTP password is not configured.");
            var message = new MimeMessage();
            message.From.Add(new MailboxAddress("noreply", smtpUserName));
            message.To.Add(new MailboxAddress(email, email));
            message.Subject = subject;

            var bodyBuilder = new BodyBuilder
            {
                HtmlBody = htmlMessage
            };

            message.Body = bodyBuilder.ToMessageBody();

            using (var client = new MailKit.Net.Smtp.SmtpClient())
            {
                await client.ConnectAsync(smtpHost, _smtpSettings.Port, true);
                await client.AuthenticateAsync(smtpUserName, smtpPassword);
                await client.SendAsync(message);
                await client.DisconnectAsync(true);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email.");
        }
    }
}
