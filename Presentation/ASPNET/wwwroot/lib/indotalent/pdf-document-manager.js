(function (window, document) {
    'use strict';

    function showError(error) {
        const message = window.AxiosManager?.getErrorMessage?.(error, 'Không thể tạo PDF.')
            || error?.message
            || 'Không thể tạo PDF.';
        console.error('Unable to generate PDF.', error);
        if (window.Swal) {
            void window.Swal.fire({
                icon: 'error',
                title: 'Tạo PDF thất bại',
                text: message,
                confirmButtonText: 'Đồng ý'
            });
        } else {
            window.alert(message);
        }
    }

    async function downloadElement(options = {}) {
        const element = typeof options.element === 'string'
            ? document.querySelector(options.element)
            : options.element;
        if (!element) throw new Error('PDF content was not found.');
        if (!window.html2canvas || !window.jspdf?.jsPDF) throw new Error('PDF libraries are not available.');

        const scale = options.scale || 2;
        const canvas = await window.html2canvas(element, {
            scale,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false
        });

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const margin = 8;
        const pageWidth = 210;
        const pageHeight = 297;
        const contentWidthMm = pageWidth - margin * 2;
        const contentHeightMm = pageHeight - margin * 2 - 5;
        const pixelsPerMm = canvas.width / contentWidthMm;
        const firstSliceHeight = Math.max(1, Math.floor(contentHeightMm * pixelsPerMm));

        const contentRect = element.getBoundingClientRect();
        const tableHead = element.querySelector('thead');
        const headRect = tableHead?.getBoundingClientRect?.();
        const headSource = headRect ? {
            x: Math.max(0, Math.round((headRect.left - contentRect.left) * scale)),
            y: Math.max(0, Math.round((headRect.top - contentRect.top) * scale)),
            width: Math.min(canvas.width, Math.round(headRect.width * scale)),
            height: Math.max(0, Math.round(headRect.height * scale))
        } : null;

        let sourceY = 0;
        let pageIndex = 0;
        while (sourceY < canvas.height) {
            const repeatHeader = pageIndex > 0 && headSource?.height > 0;
            const availableSourceHeight = Math.max(1, firstSliceHeight - (repeatHeader ? headSource.height : 0));
            const sliceHeight = Math.min(availableSourceHeight, canvas.height - sourceY);
            const pageCanvas = document.createElement('canvas');
            pageCanvas.width = canvas.width;
            pageCanvas.height = sliceHeight + (repeatHeader ? headSource.height : 0);
            const context = pageCanvas.getContext('2d');
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

            let targetY = 0;
            if (repeatHeader) {
                context.drawImage(canvas,
                    headSource.x, headSource.y, headSource.width, headSource.height,
                    headSource.x, 0, headSource.width, headSource.height);
                targetY = headSource.height;
            }
            context.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, targetY, canvas.width, sliceHeight);

            if (pageIndex > 0) pdf.addPage();
            const imageHeightMm = pageCanvas.height / pixelsPerMm;
            pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', margin, margin, contentWidthMm, imageHeightMm);
            sourceY += sliceHeight;
            pageIndex += 1;
        }

        const totalPages = pdf.getNumberOfPages();
        for (let page = 1; page <= totalPages; page++) {
            pdf.setPage(page);
            pdf.setFontSize(8);
            pdf.setTextColor(100);
            pdf.text(`${page}/${totalPages}`, pageWidth / 2, pageHeight - 4, { align: 'center' });
        }

        pdf.save(options.fileName || 'document.pdf');
        return { pageCount: totalPages };
    }

    async function downloadSafely(options) {
        try {
            return await downloadElement(options);
        } catch (error) {
            showError(error);
            return null;
        }
    }

    window.PdfDocumentManager = { downloadElement, downloadSafely };
})(window, document);
