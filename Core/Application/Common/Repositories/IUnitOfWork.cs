namespace Application.Common.Repositories;

public interface IUnitOfWork
{
    Task SaveAsync(CancellationToken cancellationToken = default);
    Task ExecuteInTransactionAsync(
        Func<CancellationToken, Task> operation,
        CancellationToken cancellationToken = default);
    Task AcquireTransactionLockAsync(string resource, CancellationToken cancellationToken = default);
    void Save();
}
