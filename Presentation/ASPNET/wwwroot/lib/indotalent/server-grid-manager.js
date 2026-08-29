const ServerGridManager = {
    buildQuery: (state = {}) => {
        const take = Math.min(Math.max(Number(state.take) || 50, 1), 200);
        const skip = Math.max(Number(state.skip) || 0, 0);
        const search = Array.isArray(state.search)
            ? (state.search.map(item => item.key).find(Boolean) ?? '')
            : (state.search?.key ?? '');
        const sort = state.sorted?.[0];
        const params = new URLSearchParams({
            page: String(Math.floor(skip / take) + 1),
            pageSize: String(take)
        });
        if (search) params.set('search', search);
        if (sort?.name) params.set('sortField', sort.name);
        if (sort?.direction) params.set('sortDirection', sort.direction);
        return `?${params}`;
    },
    unwrap: (response, map = item => item) => {
        const content = response?.data?.content ?? {};
        const data = Array.isArray(content.data) ? content.data.map(map) : [];
        return { result: data, count: Number(content.totalCount ?? data.length) };
    }
};

if (typeof window !== 'undefined') window.ServerGridManager = ServerGridManager;
if (typeof module !== 'undefined' && module.exports) module.exports = ServerGridManager;
