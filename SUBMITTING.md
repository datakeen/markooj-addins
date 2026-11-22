# Submitting an add-in

This page takes you from an idea to an add-in that anyone can install from **File → Add-ins → Browse** in Markooj.
You need a free GitHub account and a little JavaScript. Everything happens on the GitHub website; you do not need to
install Git.

## 1. Make a repository from the template

1. Open <https://github.com/datakeen/markooj-addin-template>.
2. Click the green **Use this template** button, then **Create a new repository**.
3. Under **Repository name**, type a name for your add-in, such as `word-goals`.
4. Leave it **Public**, and click **Create repository**.

Your new repository holds a complete add-in, **Abbreviations**: `manifest.json`, `main.js`, `styles.css`, a
`README.md`, a `LICENSE` and a workflow that publishes releases.

## 2. Describe your add-in in manifest.json

1. In your repository, click `manifest.json`, then the pencil icon (**Edit this file**).
2. Change these lines:

   | Field | What to write |
   | --- | --- |
   | `id` | A short id for your add-in: 3 to 40 lowercase letters, digits and hyphens, such as `word-goals`. It never changes later. |
   | `name` | The name people see, such as `Word Goals`. Do not use the word "Markooj" in it. |
   | `version` | `1.0.0` for your first release. |
   | `minMarkooj` | The oldest Markooj version your add-in works with. Keep `1.1.0` if you are not sure. |
   | `author` | Your name. |
   | `authorUrl` | Your website or GitHub profile, starting with `https://`. Optional. |
   | `description` | One sentence about what it does, at most 250 characters. |
   | `icon`, `color` | The icon and color of your card. Optional. |
   | `category` | One of `writing`, `research`, `math`, `languages`, `export`, `productivity`, `developer`, `fun`, `other`. |
   | `files` | Only if your add-in needs extra data files, such as a word list. Optional. |
   | `permissions` | A plain note if your add-in does more than edit the open document, such as "Downloads word lists from example.org". Optional. |

3. Click **Commit changes**, then **Commit changes** again.

## 3. Write main.js

`main.js` is your add-in's code. Markooj runs it once when it starts, with three names ready to use: `app` (the whole
Markooj application), `markooj` (the simple document API that macros use) and `addin` (your add-in's id, version and
folder, and `addin.file(name)` to read a data file listed in `manifest.json`). The Abbreviations example in the template
shows a command, a ribbon button, a status bar item, a Save As format, a setting and a test.

The full API is in [docs/ADDINS.md](https://github.com/datakeen/markooj/blob/main/docs/ADDINS.md).

**Try it on your computer before you publish:**

1. In Markooj, click **File → Add-ins → Open add-ins folder**.
2. In that folder, make a folder named after your add-in's id, such as `word-goals`, and copy `manifest.json`,
   `main.js`, `styles.css` and any data files into it.
3. Click **Reload add-ins**. Your add-in runs with its styles and data files, as it will from the store. If it has an
   error, the error shows on its card.
4. When you are done testing, delete that folder. Markooj never installs over a folder it did not install itself.

Update `README.md` too: say what your add-in does and how to use it. Markooj shows the README on your add-in's page.

## 4. Publish a release

The template's workflow builds the release for you when you add a tag.

1. In your repository, click **Releases** (on the right), then **Draft a new release**.
2. Click **Choose a tag**, type `v` and the version from `manifest.json`, such as `v1.0.0`, and click
   **Create new tag: v1.0.0 on publish**.
3. Click **Publish release**.

   Or, with Git on your computer: `git tag v1.0.0` and `git push origin v1.0.0`.

4. Click the **Actions** tab. The **Release** workflow checks `manifest.json` and attaches `manifest.json`, `main.js`
   and `styles.css` to the release. When it shows a green check mark, open **Releases**: the files are listed under
   **Assets**.

If the workflow fails, click it to read why. The most common reason is a tag that does not match the version in
`manifest.json`.

You can also make the release by hand: create a release and drag `manifest.json`, `main.js` and `styles.css` into
**Attach binaries**. Do not mark it as a pre-release.

## 5. Add your add-in to the list

1. Open <https://github.com/datakeen/markooj-addins/blob/main/community-addins.json>.
2. Click the pencil icon (**Edit this file**). GitHub offers to make a copy (a fork) for you; accept it.
3. Add your entry at the end of the list. Put a comma after the `}` of the entry before yours:

   ```json
     {
       "id": "word-goals",
       "name": "Word Goals",
       "author": "Your Name",
       "description": "Set a word goal for each section and see your progress",
       "repo": "your-user-name/word-goals",
       "category": "productivity",
       "tags": ["goals", "word-count"]
     }
   ```

   - `id` must be the same as in your `manifest.json`.
   - `repo` is your repository as `owner/name`, as in its web address.
   - `tags` are up to 10 lowercase search words.

4. Click **Commit changes**, then **Propose changes**, then **Create pull request**.
5. Fill in the checklist in the pull request, and click **Create pull request**.

## 6. What happens next

- **An automatic check** runs within a minute or two and posts a comment on your pull request. It checks your entry
  and your latest release: that `manifest.json` and `main.js` are there, that the ids match, that the versions look
  like `1.0.0`, and that the files are not too large (`main.js` up to 2 MB, the whole add-in up to 50 MB). If it lists
  problems, fix them (in your entry or in a new release) and the check runs again.
- **A maintainer reads your code** against the [review checklist](REVIEW-CHECKLIST.md) and the
  [policies](POLICIES.md), and may ask questions in the pull request.
- **When it is merged**, your add-in appears in **File → Add-ins → Browse** within an hour or so.

## Updating your add-in

You do not need a new pull request for updates:

1. Raise `version` in `manifest.json`, such as `1.1.0`.
2. Publish a release with the matching tag, such as `v1.1.0`.

The list picks up your newest release within a day, and Markooj offers the update to everyone who installed it.

Open a pull request only to change your entry in the list: its name, description, category, tags, or a new repository.
If you want your add-in removed, open a pull request that removes your entry, or an issue.

## Rules in short

- One repository, one add-in. The `id` never changes.
- Readable code only: no minified or obfuscated `main.js`, and no code downloaded and run later.
- Say in your description and in `permissions` if your add-in uses the internet. Never collect or send the user's
  text or data without asking.
- Only add-ins from the Markooj team may use the word "Markooj" in their name.

The full rules are in [POLICIES.md](POLICIES.md).
