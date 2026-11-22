# Markooj add-ins

This repository is the list of community add-ins for [Markooj](https://datakeen.github.io/markooj/), the calm,
Word-like Markdown editor. Markooj reads this list to show add-ins in **File → Add-ins → Browse**, where you can
install them with one click.

## What add-ins are

An add-in adds something to Markooj: a ribbon button, a command, a Save As format, a setting, a status bar item or a
new Markdown feature. Each add-in is made by its author and lives in the author's own GitHub repository. This
repository only lists them, so Markooj can find them.

## Install an add-in

1. In Markooj, click **File → Add-ins**, then the **Browse** tab (or click **Get add-ins** on the **Add-ins** tab of
   the ribbon).
2. Search for an add-in, or pick a category. Click a card to read about the add-in.
3. Click **Install**. The first time, Markooj explains what community add-ins are and asks you to turn them on:
   click **Turn on**. The add-in then starts at once.

**Updates:** when an author publishes a new version, **File → Add-ins** shows an update. Click **Update**, or
**Update all**. **Uninstall** removes an add-in, and the switch on its card turns it off without removing it.

Markooj downloads add-ins only from GitHub, and checks every file against the size and SHA-256 fingerprint in this
list before it installs it.

## Safety

Community add-ins run with the same rights as Markooj itself. They can read and change your documents, and they can do
anything Markooj can do on your computer. Before an add-in is listed, a maintainer reads its code and checks it against
the [review checklist](REVIEW-CHECKLIST.md) and the [policies](POLICIES.md), but no review can promise that an add-in
is free of mistakes. Install add-ins you need, from authors you trust.

A **check mark** next to an add-in's name ("Made by the Markooj team") means its repository is under
[datakeen](https://github.com/datakeen). Markooj works this out from the repository itself, not from the list.

If you find an add-in that breaks the [policies](POLICIES.md), please
[open an issue](https://github.com/datakeen/markooj-addins/issues) with its name and what you saw.

## Make your own add-in

Start from the [add-in template](https://github.com/datakeen/markooj-addin-template). It holds a complete working
add-in, **Abbreviations**, and a workflow that publishes your releases. When your add-in is ready, follow
[SUBMITTING.md](SUBMITTING.md) to list it here.

The add-in API is described in
[docs/ADDINS.md](https://github.com/datakeen/markooj/blob/main/docs/ADDINS.md) in the Markooj repository.

## What is in this repository

| File | What it is |
| --- | --- |
| `community-addins.json` | The list: one entry per add-in. |
| `schema/` | JSON Schemas for the list and for an add-in's `manifest.json`. |
| `tools/validate.js` | Checks the list, and with `--remote` each add-in's latest release. |
| `tools/build-index.js` | Builds `index.json`, the file Markooj reads. |
| `tools/test.js` | Tests for the tools (no network needed). |
| `.github/workflows/` | Checks pull requests, tests the tools, and publishes `index.json` every day. |
| [SUBMITTING.md](SUBMITTING.md) | How to list your add-in, step by step. |
| [REVIEW-CHECKLIST.md](REVIEW-CHECKLIST.md) | What maintainers check before they merge. |
| [POLICIES.md](POLICIES.md) | What add-ins may not do. |

Run the tools with Node.js 18 or later. Nothing to install:

```sh
node tools/test.js                    # tests, offline
node tools/validate.js                # check community-addins.json, offline
node tools/validate.js --remote       # also check every add-in's latest release on GitHub
node tools/build-index.js             # build dist/index.json
```

Set `GITHUB_TOKEN` to make more GitHub API requests per hour.

## For developers: index.json

Every day, and whenever the list changes, a workflow builds `index.json` and publishes it to the release with the
tag `index`:

<https://github.com/datakeen/markooj-addins/releases/download/index/index.json>

```json
{
  "format": 1,
  "updated": "2026-11-22T03:17:00.000Z",
  "addins": [
    {
      "id": "abbreviations",
      "name": "Abbreviations",
      "author": "Markooj",
      "description": "List the abbreviations defined in a document",
      "repo": "datakeen/markooj-addin-template",
      "category": "writing",
      "tags": ["abbreviations", "acronyms", "glossary"],
      "verified": true,
      "version": "1.0.0",
      "minMarkooj": "1.1.0",
      "tag": "v1.0.0",
      "assets": [
        { "name": "manifest.json", "url": "https://github.com/datakeen/markooj-addin-template/releases/download/v1.0.0/manifest.json", "size": 512, "sha256": "…" },
        { "name": "main.js", "url": "https://github.com/datakeen/markooj-addin-template/releases/download/v1.0.0/main.js", "size": 6144, "sha256": "…" },
        { "name": "styles.css", "url": "https://github.com/datakeen/markooj-addin-template/releases/download/v1.0.0/styles.css", "size": 300, "sha256": "…" }
      ],
      "readmeUrl": "https://raw.githubusercontent.com/datakeen/markooj-addin-template/v1.0.0/README.md",
      "homepage": "https://github.com/datakeen/markooj-addin-template",
      "updatedAt": "2026-11-20T10:00:00Z",
      "icon": "table",
      "color": "#30b0c7",
      "authorUrl": "https://datakeen.github.io/markooj/"
    }
  ]
}
```

- `name`, `author`, `description`, `category` and `tags` come from `community-addins.json`; `version` and
  `minMarkooj` from the release's `manifest.json`.
- `verified` is true when the repository belongs to datakeen.
- `assets` lists the files of the add-in: `manifest.json`, `main.js`, `styles.css` when there is one, and the extra
  files named in the manifest. Other files on the release are left out.
- `icon`, `color`, `authorUrl` and `permissions` are copied from the manifest when it has them.
- An add-in whose newest release has a problem keeps its last good version in the index; a new add-in with a problem
  is left out until it is fixed.

## Questions

Need help with an add-in, want yours in the store, or found an add-in that misbehaves? Open an
[issue](https://github.com/datakeen/markooj-addins/issues), or [send a message](https://tally.so/r/Dq7D5p?from=addins-readme).
It is a short form, and you will get a reply.

## License

The tools and workflows in this repository are licensed under the GNU Affero General Public License, version 3 or
later: see [LICENSE](LICENSE).

The list (`community-addins.json`) and the published `index.json` are dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/): anyone may use them for any purpose. See
[LICENSE-DATA.md](LICENSE-DATA.md). Each add-in has its own license, chosen by its author.
