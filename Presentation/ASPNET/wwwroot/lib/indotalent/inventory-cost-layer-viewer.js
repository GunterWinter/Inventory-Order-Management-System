window.InventoryCostLayerViewer = (() => {
    const escapeHtml = value => String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    const quantity = value => NumberFormatManager.formatToLocale(value ?? 0);
    const money = value => NumberFormatManager.formatMoneyToLocale(value ?? 0);
    const date = value => value
        ? DateFormatManager.formatToLocale(DateFormatManager.parseBusinessDate(value))
        : '';

    const show = async (items, title = 'Chi tiết giá vốn FIFO') => {
        const rows = (items ?? []).map(item => `
            <tr>
                <td>${escapeHtml(item.sourceModule)}</td>
                <td>${escapeHtml(item.sourceNumber)}</td>
                <td>${escapeHtml(date(item.sourceDate))}</td>
                <td>${escapeHtml(item.productSerialNumber)}</td>
                <td class="text-end">${quantity(item.quantity)}</td>
                <td class="text-end">${money(item.unitPrice)}</td>
                <td class="text-end">${money(item.total)}</td>
            </tr>`).join('');

        await Swal.fire({
            title,
            width: '900px',
            confirmButtonText: 'Đóng',
            html: `<div class="table-responsive">
                <table class="table table-sm table-bordered text-start align-middle">
                    <thead><tr><th>Nguồn</th><th>Số chứng từ</th><th>Ngày chứng từ</th><th>Serial</th><th class="text-end">Số lượng</th><th class="text-end">Giá vốn đơn vị</th><th class="text-end">Tổng giá vốn</th></tr></thead>
                    <tbody>${rows || '<tr><td colspan="7" class="text-center text-muted">Chưa có lớp giá vốn được chốt.</td></tr>'}</tbody>
                </table>
            </div>`
        });
    };

    const select = async (items) => {
        const rows = (items ?? []).map(item => `
            <tr>
                <td>${escapeHtml(item.sourceNumber)}</td>
                <td>${escapeHtml(date(item.sourceDate))}</td>
                <td class="text-end">${quantity(item.availableReturnQuantity)}</td>
                <td class="text-end">${money(item.unitCost)}</td>
                <td><input class="form-control form-control-sm inventory-cost-layer-quantity" inputmode="decimal" data-id="${escapeHtml(item.sourceCostAllocationId)}" data-max="${escapeHtml(item.availableReturnQuantity)}" data-cost="${escapeHtml(item.unitCost)}" value="${quantity(item.currentReturnQuantity)}"></td>
            </tr>`).join('');
        const result = await Swal.fire({
            title: 'Chọn lớp giá vốn trả hàng',
            width: '760px',
            showCancelButton: true,
            confirmButtonText: 'Áp dụng',
            cancelButtonText: 'Hủy',
            html: `<div class="table-responsive"><table class="table table-sm table-bordered text-start align-middle">
                <thead><tr><th>Số chứng từ</th><th>Ngày chứng từ</th><th class="text-end">Có thể trả</th><th class="text-end">Giá vốn</th><th>Số lượng trả</th></tr></thead>
                <tbody>${rows}</tbody></table></div>`,
            preConfirm: () => {
                const selections = [];
                let totalQuantity = 0;
                let totalCost = 0;
                for (const input of document.querySelectorAll('.inventory-cost-layer-quantity')) {
                    const quantity = NumberFormatManager.parseLocaleNumber(input.value);
                    const max = Number(input.dataset.max ?? 0);
                    const unitCost = Number(input.dataset.cost ?? 0);
                    if (quantity == null || quantity < 0 || quantity > max + 0.000001) {
                        Swal.showValidationMessage('Số lượng theo lớp giá vốn phải từ 0 đến số lượng có thể trả.');
                        return false;
                    }
                    if (quantity > 0) selections.push({ sourceCostAllocationId: input.dataset.id, quantity });
                    totalQuantity += quantity;
                    totalCost += quantity * unitCost;
                }
                return { selections, totalQuantity, totalCost, unitCost: totalQuantity ? totalCost / totalQuantity : 0 };
            }
        });
        return result.isConfirmed ? result.value : null;
    };

    return { show, select };
})();
