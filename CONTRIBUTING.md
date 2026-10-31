# Working on BabyBlue

For Thami (`jam/`) and Katlego (`kat/`). Repo: `github.com/Jameel-The-Designer/babyblue-os` (private).

## Branches

| Branch | Purpose | Rule |
|---|---|---|
| `dev` | Where work happens (the default branch) | Branch off it, open PRs into it |
| `staging` | Review before release | Merge from `dev` only |
| `main` | Production | Merge from `staging` only, and only when Thami says so ("push to production") |

## Make a change

```bash
git clone https://github.com/Jameel-The-Designer/babyblue-os.git
cd babyblue-os
git checkout dev && git pull
git checkout -b kat/short-description       # jam/ for Thami
npm install
npm run dev                                 # http://localhost:3000
npm test && npm run typecheck               # both must pass
git add -A
git commit -m "type: BabyBlue — what changed"
git push -u origin kat/short-description
```

Then open a pull request into `dev` on GitHub. Commit types: `feat` `fix` `style` `copy` `asset` `refactor` `chore` `docs`.

Read `AGENTS.md` first if you use an AI coding tool: this is a newer Next.js than most tools know, and the guides in `node_modules/next/dist/docs/` are the reference.

## Reverse a change

Never rewrite shared history (`reset --hard` then force-push). Undo with a new commit instead, so nothing is lost and the undo can itself be undone.

- **On GitHub (easiest):** open the merged pull request and press **Revert**. GitHub opens a new PR that undoes it. Merge that PR.
- **On your machine:** find the commit (`git log --oneline` or GitHub → Commits), then:
  ```bash
  git checkout dev && git pull
  git revert <commit-sha>       # for a merge commit: git revert -m 1 <sha>
  git push origin dev
  ```
- **Undoing several commits:** revert them newest first, or revert the PR that contained them.

## Production

Production is `https://babyblue-demo.vercel.app`, deployed from `main` with the Vercel CLI:

```bash
vercel deploy --prod --scope jameel-the-designers-projects
```

The Vercel project is **not linked to GitHub**, so merging to `main` does not deploy by itself, and reverting code on GitHub does not change the live site until someone redeploys. To roll the live site back without touching code: Vercel → project `babyblue-demo` → Deployments → pick the earlier one → **Promote to Production** (or `vercel rollback`). This needs access to the Vercel team.

The site is `noindex` (search engines are told to stay away) until `ALLOW_INDEXING=true` is set, and every practitioner in it is fictional demo data. Do not add real people's details to the demo database (see `COMPLIANCE.md`).
