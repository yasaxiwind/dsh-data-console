# Release checklist

Everything below runs from this directory. Nothing here publishes on its own;
the steps that upload are marked **publish**.

## 0. One-time metadata

Fill the account-specific fields before the first publish (they are intentionally
absent from the manifest until you own the URLs):

```sh
npm pkg set author.name="Your Name"
npm pkg set repository.type=git \
  repository.url="git+https://github.com/<you>/dsh-data-console.git" \
  homepage="https://github.com/<you>/dsh-data-console#readme" \
  bugs.url="https://github.com/<you>/dsh-data-console/issues"
```

Then rebuild the marketplace index so it carries the repository and homepage:

```sh
npm run market:build
```

## 1. Checks

```sh
npm test                 # syntax + 14 sidecar tests
npm run verify:package   # manifest, locales, detail docs, icon, exports, files
npm run release:check    # both of the above
npm pack --dry-run       # exact file list that would be published
```

Requirements: Node.js 20+ and Python 3.10+ with `pandas` and `openpyxl`
(the bundled DSH runtime works too). `test:routes` additionally needs a running
Host and a browser session cookie; it is not part of `release:check`.

Review the `npm pack --dry-run` list:

- included: `index.js`, `client.js`, `py/sidecar.py`, `test` **not** included,
  `py/__pycache__` **not** included, `cordis.patch.yml`, `locale/*.json`,
  `docs/*`, `icon.svg`, `README.md`, `LICENSE`, `CHANGELOG.md`;
- no `browser-screenshots/`, `scratch/`, `market/` or `*.tgz`.

## 2. Version

The version lives in `package.json` and `CHANGELOG.md`. Bump both, then:

```sh
npm run market:build   # writes market/index.json with the new version
npm pack               # dsh-data-console-<version>.tgz
```

## 3. Publish to npm — **publish**

```sh
npm login
npm publish            # unscoped package: public by default
npm view dsh-data-console version dist.tarball
```

If the package is ever moved under a scope, use `npm publish --access public`
and add `publishConfig.access` (already set to `public`).

## 4. Install test from the registry

In a clean DSH profile (not the development link):

```sh
dsh plugin --profile <profile> add dsh-data-console@1.0.0
```

or **Settings → Plugins → + Add plugin** in the desktop app and enter the package
name. Restart if the Host asks for it, then open the console and load a CSV.
Uninstall the test copy afterwards.

## 5. GitHub — **publish**

```sh
git init
git add .
git commit -m "dsh-data-console 1.0.0"
git branch -M main
git remote add origin git@github.com:<you>/dsh-data-console.git
git push -u origin main
git tag v1.0.0 && git push origin v1.0.0
```

Create a GitHub Release for `v1.0.0` and attach `dsh-data-console-1.0.0.tgz`
from step 2. The tag also triggers `.github/workflows/release.yml`, which
publishes to npm when the `NPM_TOKEN` secret exists.

## 6. Marketplace listings

- **Self-hosted DSH index**: `market/index.json` is a format-1 plugin market
  index. Host it at any https URL (raw GitHub, jsDelivr, GitHub Pages) and add it
  under **Plugins → Discover → Index sources**. jsDelivr form:
  `https://cdn.jsdelivr.net/gh/<you>/dsh-data-console@v1.0.0/market/index.json`
- **awesome-dsh-plugin catalog**: open a PR to
  <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin> with one entry for
  `dsh-data-console`. The dsh-market app, dshmarket.com and
  awesome-dsh-plugin.com pick it up automatically.
- **DSH Discover**: any user can add the index URL above; no central submission
  is required.

## 7. Mirrors and CDNs

- `registry.npmmirror.com` mirrors npm automatically; Chinese users can install
  through it without extra work.
- jsDelivr and unpkg serve the published files for docs and the market index:
  `https://cdn.jsdelivr.net/npm/dsh-data-console@1.0.0/`.
- A private/team registry (Verdaccio, GitHub Packages, GitLab Package Registry)
  uses the same tarball, e.g. `npm publish --registry https://npm.pkg.github.com`
  after setting the package scope.

## 8. After publishing

- Install once from npm in a fresh profile and repeat a short smoke test:
  open CSV, profile, table sort, SQL, chart, export, agent `data_query`.
- Check the detail page in **Plugins** (English and Chinese) and the icon.
- Add the release notes link to the GitHub Release.
