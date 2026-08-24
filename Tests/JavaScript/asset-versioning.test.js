const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pagesRoot = path.resolve(__dirname, '../../Presentation/ASPNET/FrontEnd');
const webProjectPath = path.resolve(__dirname, '../../Presentation/ASPNET/ASPNET.csproj');
const programPath = path.resolve(__dirname, '../../Presentation/ASPNET/Program.cs');

function findRazorFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return findRazorFiles(fullPath);
        return entry.name.endsWith('.cshtml') ? [fullPath] : [];
    });
}

test('local Razor assets use content-based cache versioning', () => {
    const missingVersion = [];
    const manualVersions = [];
    const localAssetTag = /<(?:script|link)\b(?=[^>]*(?:src|href)="~\/)[^>]*>/g;

    for (const file of findRazorFiles(pagesRoot)) {
        const source = fs.readFileSync(file, 'utf8');
        for (const tag of source.match(localAssetTag) ?? []) {
            const relativePath = path.relative(pagesRoot, file);
            if (!/\basp-append-version="true"/.test(tag)) {
                missingVersion.push(`${relativePath}: ${tag}`);
            }
            if (/(?:src|href)="~\/[^\"]*[?&]v=/.test(tag)) {
                manualVersions.push(`${relativePath}: ${tag}`);
            }
        }
    }

    assert.deepEqual(missingVersion, [], 'Local assets must use asp-append-version="true".');
    assert.deepEqual(manualVersions, [], 'Use content hashes instead of manually maintained version query strings.');
});

test('IIS publish includes page scripts and serves them without stale caching', () => {
    const project = fs.readFileSync(webProjectPath, 'utf8');
    const program = fs.readFileSync(programPath, 'utf8');

    assert.match(project, /Content Include="FrontEnd\\\*\*\\\*\.js" CopyToPublishDirectory="PreserveNewest"/);
    assert.match(program, /RequestPath\s*=\s*"\/FrontEnd"/);
    assert.match(program, /CacheControl\s*=\s*"no-cache, no-store, must-revalidate"/);
});
