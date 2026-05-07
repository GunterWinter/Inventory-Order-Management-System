(function (window) {
    const FINAL_STATUS_VALUES = new Set(['1', '2']);

    function isFinalStatus(status) {
        return FINAL_STATUS_VALUES.has(String(status ?? ''));
    }

    async function confirmIfFinalStatus(status) {
        const statusValue = String(status ?? '');
        if (!isFinalStatus(statusValue)) {
            return true;
        }

        const actionText = statusValue === '1' ? 'hủy chứng từ' : 'xác nhận chứng từ';
        const result = await Swal.fire({
            icon: 'warning',
            title: 'Xác nhận',
            html: `
                <div class="text-start">
                    <p>Vui lòng chắc chắn rằng thông tin đã được kiểm tra đầy đủ.</p>
                    <p class="mb-0">Sau khi lưu trạng thái này, dữ liệu có thể ảnh hưởng tới tồn kho, báo cáo và các chứng từ phát sinh.</p>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Tôi đã kiểm tra, tiếp tục lưu',
            cancelButtonText: 'Kiểm tra lại',
            focusCancel: true
        });

        return result.isConfirmed;
    }

    window.DocumentStatusGuard = {
        isFinalStatus,
        confirmIfFinalStatus
    };
})(window);
