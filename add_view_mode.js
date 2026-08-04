const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'Presentation', 'ASPNET', 'FrontEnd', 'Pages');
const modules = [
    'DeliveryOrders', 'GoodsReceives', 'TransferOuts', 'TransferIns', 
    'MaterialExports', 'StockCounts', 'Scrappings', 'SalesReturns', 'PurchaseReturns'
];

modules.forEach(mod => {
    const jsFile = path.join(pagesDir, mod, mod.replace(/s$/, '') + 'List.cshtml.js');
    const htmlFile = path.join(pagesDir, mod, mod.replace(/s$/, '') + 'List.cshtml');

    if (fs.existsSync(jsFile)) {
        let jsContent = fs.readFileSync(jsFile, 'utf8');
        
        if (!jsContent.includes('isViewMode')) {
            // 1. Add isViewMode to state
            jsContent = jsContent.replace(/deleteMode:\s*false,/, 'deleteMode: false,\n            isViewMode: false,');
            
            // 2. Add ViewCustom to toolbar
            jsContent = jsContent.replace(/\{\s*text:\s*['"]Edit['"][^}]+id:\s*['"]EditCustom['"]\s*\}/, 
                "{ text: 'Edit', tooltipText: 'Edit', prefixIcon: 'e-edit', id: 'EditCustom' },\n                        { text: 'Xem', tooltipText: 'Xem chi ti?t', prefixIcon: 'e-eye', id: 'ViewCustom' }");
            
            // 3. Update enableItems
            jsContent = jsContent.replace(/enableItems\(\['EditCustom'/g, "enableItems(['EditCustom', 'ViewCustom'");
            
            // 4. Add ViewCustom handler
            const editHandlerRegex = /(if\s*\(\s*args\.item\.id\s*===\s*['"]EditCustom['"]\s*\)\s*\{[\s\S]*?mainModal\.obj\.show\(\);\s*\})/g;
            const match = editHandlerRegex.exec(jsContent);
            if (match) {
                let viewHandler = match[1].replace(/'EditCustom'/g, "'ViewCustom'")
                                         .replace(/state\.deleteMode\s*=\s*false;/g, "state.deleteMode = false;\n                                state.isViewMode = true;");
                jsContent = jsContent.replace(match[1], match[1] + '\n\n                        ' + viewHandler);
            }

            // 5. Update secondaryGrid create and refresh
            if (jsContent.includes('secondaryGrid = {')) {
                jsContent = jsContent.replace(/editSettings:\s*\{[^}]+\}/, "editSettings: { allowEditing: !state.isViewMode, allowAdding: !state.isViewMode, allowDeleting: !state.isViewMode, showDeleteConfirmDialog: true, mode: 'Normal', allowEditOnDblClick: !state.isViewMode }");
                jsContent = jsContent.replace(/toolbar:\s*\[([\s\S]*?)\](,\s*beforeDataBound)/, "toolbar: state.isViewMode ? ['ExcelExport'] : []");
                
                const refreshRegex = /refresh:\s*\(\)\s*=>\s*\{\s*secondaryGrid\.obj\.setProperties\(\{\s*dataSource:\s*state\.secondaryData\s*\}\);\s*\}/;
                jsContent = jsContent.replace(refreshRegex, efresh: () => {
                const allowEdit = !state.isViewMode;
                secondaryGrid.obj.setProperties({ 
                    dataSource: state.secondaryData,
                    editSettings: { allowEditing: allowEdit, allowAdding: allowEdit, allowDeleting: allowEdit, showDeleteConfirmDialog: true, mode: 'Normal', allowEditOnDblClick: allowEdit },
                    toolbar: state.isViewMode ? ['ExcelExport'] : [
                        'ExcelExport',
                        { type: 'Separator' },
                        'Add', 'Edit', 'Delete', 'Update', 'Cancel'
                    ]
                });
            });
            }

            // 6. onMainModalHidden
            jsContent = jsContent.replace(/onMainModalHidden:\s*\(\)\s*=>\s*\{([\s\S]*?)\},/, "onMainModalHidden: () => {    state.isViewMode = false;\n            },");
            
            fs.writeFileSync(jsFile, jsContent, 'utf8');
            console.log('Updated ' + jsFile);
        }
    }

    if (fs.existsSync(htmlFile)) {
        let htmlContent = fs.readFileSync(htmlFile, 'utf8');
        
        if (!htmlContent.includes('isViewMode')) {
            htmlContent = htmlContent.replace(/<form\s+id="MainForm">/, '<fieldset :disabled="state.isViewMode">\n                        <form id="MainForm">');
            htmlContent = htmlContent.replace(/<\/form>/, '</form>\n                    </fieldset>');
            htmlContent = htmlContent.replace(/id="MainSaveButton"/, 'v-if="!state.isViewMode"\n                            id="MainSaveButton"');
            
            fs.writeFileSync(htmlFile, htmlContent, 'utf8');
            console.log('Updated ' + htmlFile);
        }
    }
});
