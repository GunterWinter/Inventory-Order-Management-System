using Application.Common.Repositories;
using Infrastructure.DataAccessManager.EFCore.Contexts;

using Microsoft.EntityFrameworkCore;
using System.Data;

namespace Infrastructure.DataAccessManager.EFCore.Repositories;

public class UnitOfWork : IUnitOfWork
{
    private readonly CommandContext _context;

    public UnitOfWork(CommandContext context)
    {
        _context = context;
    }

    public async Task SaveAsync(CancellationToken cancellationToken = default)
    {
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task ExecuteInTransactionAsync(
        Func<CancellationToken, Task> operation,
        CancellationToken cancellationToken = default)
    {
        if (!_context.Database.IsRelational())
        {
            await operation(cancellationToken);
            return;
        }

        if (_context.Database.CurrentTransaction != null)
        {
            await operation(cancellationToken);
            return;
        }

        var strategy = _context.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await _context.Database.BeginTransactionAsync(
                IsolationLevel.Serializable,
                cancellationToken);

            try
            {
                await operation(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
            }
            catch
            {
                await transaction.RollbackAsync(cancellationToken);
                throw;
            }
        });
    }

    public async Task AcquireTransactionLockAsync(string resource, CancellationToken cancellationToken = default)
    {
        if (!_context.Database.IsSqlServer() || _context.Database.CurrentTransaction == null) return;

        await _context.Database.ExecuteSqlInterpolatedAsync($@"
DECLARE @lockResult int;
EXEC @lockResult = sys.sp_getapplock
    @Resource = {resource},
    @LockMode = 'Exclusive',
    @LockOwner = 'Transaction',
    @LockTimeout = 15000;
IF @lockResult < 0
    THROW 51000, N'Không thể khóa chứng từ nguồn để xử lý trả hàng. Vui lòng thử lại.', 1;", cancellationToken);
    }

    public void Save()
    {
        _context.SaveChanges();
    }
}
