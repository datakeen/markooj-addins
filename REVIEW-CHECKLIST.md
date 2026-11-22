# Review checklist

For maintainers who review a pull request that adds or changes an add-in. The automatic check (its comment on the pull
request) covers the form; this list covers what only a person can judge. Merge only when every point is fine.

## 1. The automatic check

- [ ] The check passed. Read its warnings and its "For the reviewer" notes: each note points at lines of `main.js` to
      read closely (network, `eval`, Node.js modules, encoded text, browser storage, direct HTML, the system bridge).
- [ ] The pull request changes only `community-addins.json`, and only one entry.
- [ ] For a change to an existing entry: the person who opened the pull request is the author (or the change is
      agreed with them in the pull request).

## 2. The entry

- [ ] The name and description say plainly what the add-in does. No ads, no superlatives, no emoji spam.
- [ ] The name does not copy or imitate another add-in, Markooj itself, or a brand the author does not own.
- [ ] The category fits, and the tags are words people would search for.

## 3. The repository

- [ ] A license file is present, and it lets people use the add-in.
- [ ] `README.md` explains what the add-in does and how to use it, in words a user understands.
- [ ] The release's `main.js` is the same code as `main.js` in the repository at that tag (open both and compare,
      or compare the SHA-256 from the check).

## 4. The code (read all of main.js)

- [ ] **No obfuscation.** The code is readable: no minified bundles, no long encoded strings, no packed or
      scrambled code. A small library inside the file is fine if it is the readable source with its license note.
- [ ] **No remote code.** Nothing is downloaded and then run: no `eval` or `Function` of fetched text, no `<script>`
      tags added to the page from the network, no `import()` of web addresses.
- [ ] **No hidden network use.** If the add-in uses the internet, the description or `permissions` in the manifest
      says so and says why, and the feature needs it. Addresses are fixed and named in the code.
- [ ] **No data collection.** No analytics, tracking, telemetry or sending of the user's text, file names, settings
      or anything else, unless that is the clear purpose the user asked for (for example "send to my own server"),
      and it is shown before it happens.
- [ ] **Respects user files.** Documents change only through Markooj's APIs (`doc.setText`, `markooj.doc`,
      editors), so undo works. No writing, moving or deleting files on disk unless the user chose them in a dialog for
      that purpose. No reading files the add-in does not need.
- [ ] **Respects Markooj.** No changes to Markooj's own settings that the user did not ask for; settings keys start
      with the add-in's id; command ids use the add-in's own prefix; no hiding, replacing or disabling Markooj's own
      commands, ribbon or safety notices.
- [ ] **No direct system access.** No use of Markooj's internal bridge (`window.mk`, IPC) unless there is a clear
      reason the public API cannot cover; ask the author if unsure.
- [ ] **Light on resources.** No heavy work on every keystroke, no endless timers, no large memory use without reason.
- [ ] **Safe HTML.** Text from the document is escaped before it goes into `innerHTML`.

## 5. Try it

- [ ] Install the add-in in Markooj from a file (copy `main.js` into the add-ins folder and click **Reload add-ins**).
      It loads without errors, does what the README says, and turning it off or uninstalling it leaves Markooj as
      it was.

## When something is not right

Ask in the pull request, kindly and specifically: point at the line and say what would make it acceptable. Close the
pull request only when the author does not answer for 30 days, or the add-in breaks the [policies](POLICIES.md) on
purpose.

## After merging

The **Publish index** workflow runs on the merge. Check its summary: the add-in should be listed with its version.
If an add-in already listed is found to break the policies, remove its entry (the next index drops it), and say why
in the commit message.
