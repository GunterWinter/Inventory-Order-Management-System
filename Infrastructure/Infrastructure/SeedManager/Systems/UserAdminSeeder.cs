using Infrastructure.SecurityManager.AspNetIdentity;
using Infrastructure.SecurityManager.Roles;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace Infrastructure.SeedManager.Systems;

public class UserAdminSeeder
{
    private readonly IdentitySettings _identitySettings;
    private readonly UserManager<ApplicationUser> _userManager;
    public UserAdminSeeder(
        IOptions<IdentitySettings> identitySettings,
        UserManager<ApplicationUser> userManager
        )
    {
        _identitySettings = identitySettings.Value;
        _userManager = userManager;

    }

    public async Task GenerateDataAsync()
    {
        var adminPassword = _identitySettings.DefaultAdmin.Password;
        var adminUsers = new[]
        {
            new { Email = _identitySettings.DefaultAdmin.Email, FirstName = "Root", LastName = "Admin" },
            new { Email = "nqthai09456@gmail.com", FirstName = "Thai", LastName = "Nguyen" },
            new { Email = "test@gmail.com", FirstName = "Test", LastName = "Admin" }
        };

        foreach (var adminUser in adminUsers)
        {
            await EnsureAdminUserAsync(
                adminUser.Email,
                adminUser.FirstName,
                adminUser.LastName,
                adminPassword
            );
        }
    }

    private async Task EnsureAdminUserAsync(
        string email,
        string firstName,
        string lastName,
        string password)
    {
        var applicationUser = await _userManager.FindByEmailAsync(email);

        if (applicationUser == null)
        {
            applicationUser = new ApplicationUser(email, firstName, lastName)
            {
                EmailConfirmed = true
            };
            await _userManager.CreateAsync(applicationUser, password);
        }
        else
        {
            applicationUser.FirstName = firstName;
            applicationUser.LastName = lastName;
            applicationUser.EmailConfirmed = true;
            applicationUser.IsBlocked = false;
            applicationUser.IsDeleted = false;
            await _userManager.UpdateAsync(applicationUser);
        }

        var roles = RoleHelper.GetAdminRoles();
        foreach (var role in roles)
        {
            if (!await _userManager.IsInRoleAsync(applicationUser, role))
            {
                await _userManager.AddToRoleAsync(applicationUser, role);
            }
        }
    }
}
