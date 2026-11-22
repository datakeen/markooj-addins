# Add-in policies

Markooj is a calm, private, offline writing tool, and people trust it with their work. Add-ins listed here must keep
that trust. An add-in that breaks these rules is not listed, or is removed from the list.

## Not allowed

1. **Obfuscated or minified code.** `main.js` must be readable source code. Bundled libraries must be readable and
   keep their license notes.
2. **Running code from elsewhere.** No downloading code and running it (`eval`, `Function`, injected scripts,
   `import()` of web addresses), and no "updates" that bypass a new release.
3. **Collecting data.** No analytics, tracking, telemetry, fingerprinting or advertising IDs. The user's text, files,
   file names and settings are never sent anywhere unless that is the add-in's clear purpose, the user asked for it,
   and it is said in the description.
4. **Hidden network use.** If the add-in uses the internet at all, the description or the manifest's `permissions`
   must say so and why.
5. **Harming files or the computer.** No deleting, moving, overwriting or encrypting files the user did not choose
   for that purpose. No running programs, changing system settings or reading private files such as passwords,
   browser data or keys.
6. **Taking over Markooj.** No hiding or disabling Markooj's own features, safety notices or other add-ins; no
   changing settings the user did not ask to change; no pop-ups that cannot be closed.
7. **Ads, spam and nagging.** No advertising inside Markooj, no repeated requests for reviews, payment or donations.
   One quiet link in your README or options section is fine.
8. **Pretending to be someone else.** Only add-ins from the Markooj team (repositories under datakeen) may use
   "Markooj" in their id, name or author. Do not copy another add-in's name or look, or a brand you do not own.
9. **Paid or locked features.** An add-in in this list must work fully without payment, accounts or license keys.
   It may connect to a service the user already has an account with, if that is its clear purpose.
10. **Harmful or illegal content,** and content that breaks someone else's copyright or license.
11. **Cryptocurrency mining** or any use of the user's computer for someone else's benefit.

## Expected

- One repository holds one add-in. The `id` never changes.
- A `README.md` that says what the add-in does, and a `LICENSE` file.
- Releases with `manifest.json` and `main.js` (and `styles.css` and data files if needed), where the release tag
  matches the version.
- Interface text that is short and plain. US English is preferred for English text; other languages are welcome.
- Heavy work only when the user asks for it.
- Answers to issues about security problems.

## Reporting a problem

If you find an add-in that breaks these rules, [open an issue](https://github.com/datakeen/markooj-addins/issues)
with its name and what you saw. For a security problem you do not want to share in public, use GitHub's
**Report a vulnerability** button on the **Security** tab of this repository.

## Changes to these rules

These policies may change as the add-in collection grows. Authors of listed add-ins are told in an issue on this
repository when a change affects them.
