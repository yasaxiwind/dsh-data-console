# Plugin market index

`index.json` is a format-1 DSH plugin market index for this package. It is
generated, not hand-written:

```sh
npm run market:build
```

The generator reads `package.json`, both locales, `icon.svg` and (when present)
`repository` / `homepage`, then embeds the icon as a data URL so the index is a
single self-contained file. The committed index was validated with DSH's
`@deepseek-ai/dsh-plugin-market-index` parser; the generator also enforces the
icon-size limit and the required fields.

## Host it

Any https URL works. Common choices:

- **jsDelivr** (recommended; fast in China and cached):
  `https://cdn.jsdelivr.net/gh/yasaxiwind/dsh-data-console@v1.0.0/market/index.json`
- **raw GitHub**:
  `https://raw.githubusercontent.com/yasaxiwind/dsh-data-console/v1.0.0/market/index.json`
- **GitHub Pages**: publish this `market/` directory and use its URL.

## Add it to DSH

On a host with the plugin-market bundle (Discover tab), open
**Plugins → Discover → Index sources**, paste the URL and refresh. The index is
then searchable in Discover and through the `plugin_market` agent tool.

Users of the community [dsh-market](https://dshmarket.com) app can add the same
URL as an index source, or find the plugin through the
[awesome-dsh-plugin](https://awesome-dsh-plugin.com) catalog after its PR is
merged.

## Reproducibility

`publishTimestamp` defaults to the current time. Set `SOURCE_DATE_EPOCH` to pin
it when rebuilding a release:

```sh
SOURCE_DATE_EPOCH=1795507200 npm run market:build
```
