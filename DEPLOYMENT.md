# Website deployment

The recovery-sheet app is deployed from this repository with GitHub Actions. The repository, including source files, prototypes, and Git history, is public by explicit owner authorization; the website deployment itself contains only `tools/recovery-sheet/dist`.

## Deployment boundaries

- **Website:** The initial GitHub Pages address is [sharekeeper.github.io/sharekeeper](https://sharekeeper.github.io/sharekeeper/). The Pages API is configured with `build_type: workflow`, HTTPS enforcement enabled, and no custom domain.
- **Published artifact:** `.github/workflows/deploy-pages.yml` uploads only `tools/recovery-sheet/dist`. It does not publish the repository root, documentation, source tree, or archived prototypes as website files.
- **Browser-only operation:** The app has no application backend or build-time secrets. Secret generation and PDF creation run in the browser; do not add private account details, credentials, recovery material, or production secrets to this repository or deployment configuration.
- **Path compatibility:** The app's Vite configuration uses `base: "./"` so the built website supports both the project subpath and a future custom domain.

## Build and release

Pushes to `main` trigger the deployment workflow, and an authorized maintainer can also run it manually from the [Actions workflow](https://github.com/sharekeeper/sharekeeper/actions/workflows/deploy-pages.yml). The build job uses Node.js 20, installs dependencies with `npm ci`, runs `npm test`, builds with `npm run build`, and uploads only the distribution directory.

The separate deployment job requires a successful build, configures Pages, and deploys that artifact into the `github-pages` environment. Repository permissions are limited to `contents: read` for the build and `pages: write` plus `id-token: write` for deployment; these deployment permissions and the environment follow the [GitHub custom Pages workflow requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Deployments share a `pages` concurrency group and do not cancel an in-progress deployment. All action versions are pinned to full commit SHAs resolved from their official repositories' major-version tags.

### Local validation

Run from the repository root:

```sh
cd tools/recovery-sheet
npm ci
npm test
npm run build
```

After a release, confirm that the workflow completed successfully and open the website. Check that the recovery form, PDF generation, and downloaded offline HTML work, and that unrelated repository assets are not present in the deployed artifact.

### Pages API configuration

The initial site was enabled with the following workflow-based request; the API accepts `workflow` as a `build_type`, and branch-source configuration is not used to select the deployed artifact in this setup ([GitHub Pages REST documentation](https://docs.github.com/en/rest/pages/pages?apiVersion=2022-11-28#create-a-github-pages-site)).

```sh
gh api --method POST repos/sharekeeper/sharekeeper/pages \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  -f build_type=workflow
```

Inspect the existing site rather than repeating its creation:

```sh
gh api repos/sharekeeper/sharekeeper/pages \
  --jq '{status,html_url,build_type,cname,https_enforced}'
```

## Custom domain follow-up

The intended domain is `sharekeeper.org`, but no custom domain or Namecheap DNS records were changed during initial setup. Domain access and verification remain a separate step; the default GitHub Pages deployment does not depend on them.

- **Verify ownership first:** Retrieve the organization-specific verification record from GitHub and add that exact TXT value in Namecheap. Do not invent or reuse a verification token.
- **Configure the site:** After ownership verification and authorized DNS access, attach the domain to this Pages site and add the DNS records GitHub specifies. Decide whether `www` should redirect to the apex before changing records.
- **Validate before completion:** Confirm DNS propagation, the Pages custom-domain health check, the HTTPS certificate, and the final canonical URL. Keep HTTPS enforced after the certificate is issued.

Consult the official [custom domain configuration guide](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) and [domain verification guide](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages) when performing that follow-up.
