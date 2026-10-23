# Scoped glob compatibility adapter

Replaces only the fast-glob dependency used by the pinned Next.js ESLint plugin.
The adapter delegates the async function and sync() API to tinyglobby 0.2.15.
It does not implement the entire fast-glob API.

Reason: GHSA-vfj7-8cjw-p6xm affects braces <=3.0.3 with no patched upstream release.
Tailwind 4 and this scoped replacement remove that dependency rather than hiding an audit result.
The original and replacement implementations matched on 12 fixture/option combinations; a 9000-level nesting probe completed without stack exhaustion. The complete Next build and lint step passed.

The package source is in this folder. npm pack produces the sibling fast-glob-compat.tgz used by the lockfile. Keep source, tarball, and lockfiles together. The workspace root has the same tarball because npm applies overrides from the workspace root.

Source advisory: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
