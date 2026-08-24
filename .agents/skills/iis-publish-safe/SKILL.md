---
name: iis-publish-safe
description: Keep ASP.NET Core JavaScript, CSS, and static asset changes working after publishing this project to IIS; use whenever frontend assets or IIS publish behavior are changed or verified.
---

# IIS Publish Safety

Treat localhost as a development check, not deployment proof.

- Keep local Razor asset URLs rooted with `~/` and use `asp-append-version="true"`; never add hand-maintained `?v=` values.
- When adding assets outside `wwwroot`, ensure the web project copies them to publish output. This project's page scripts under `Presentation/ASPNET/FrontEnd/**/*.js` must exist under `wwwroot/FrontEnd/**/*.js` after publish so IIS serves `/FrontEnd/...`.
- After changing a static asset, run `dotnet publish` to an isolated output directory. Compare the source and published file SHA-256 hashes; a successful build alone is insufficient.
- Smoke-test the published output through IIS Express when available. Verify the affected page/script returns HTTP 200 and `/FrontEnd` responses include `Cache-Control: no-cache, no-store, must-revalidate`.
- Do not claim IIS compatibility if the publish artifact or IIS Express smoke check was skipped; report the missing prerequisite instead.
