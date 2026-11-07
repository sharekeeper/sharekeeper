# Website deployment

The Sharekeeper website and recovery-sheet app are deployed from this repository with GitHub Actions. The repository, including source files, prototypes, and Git history, is public by explicit owner authorization; the website deployment itself contains only `tools/recovery-sheet/dist`.

## Deployment boundaries

- **Website:** The canonical domain is [sharekeeper.org](https://sharekeeper.org/), served directly by this repository's GitHub Pages deployment with `build_type: workflow` and `cname: sharekeeper.org`. The original [GitHub Pages address](https://sharekeeper.github.io/sharekeeper/) is now a redirecting alias, not an independent fallback. Check certificate readiness and HTTPS enforcement using the procedure below before declaring a domain cutover complete.
- **Published artifact:** `.github/workflows/deploy-pages.yml` uploads only `tools/recovery-sheet/dist`. It does not publish the repository root, documentation, source tree, or archived prototypes as website files.
- **Separate documents:** The portal is `index.html`; the secret generator is `recovery.html`; `sharekeeper-offline.html` is an identical pristine generator copy. The portal and recovery scripts have separate CSPs. Provider intake must never be imported into the secret generator.
- **Browser-only recovery:** Secret generation and PDF creation run in the browser, without application backends or build-time secrets. Do not add private account details, credentials, recovery material, private provider applications, or production secrets to this repository or deployment configuration.
- **Approved directory only:** Public directory data must contain only approved, explicitly publishable business fields. Keep private intake responses in the private review service, not GitHub Issues or source files. Do not claim application success if only a local draft was created or an intake destination is unconfigured.
- **Path compatibility:** The app's Vite configuration uses `base: "./"` so the built website supports both the original project subpath and the custom-domain root.

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

After a release, confirm that the workflow completed successfully and open the website. Check all portal routes, the directory and application states, the recovery interview, PDF generation, the updated blank sample, and the offline HTML. Confirm unrelated repository assets and private data are not present in the deployed artifact.

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

## Production domain and HTTPS

On November 7, 2026, the owner authorized replacing Namecheap URL forwarding with direct GitHub Pages hosting. The Pages custom domain was attached before the DNS records were saved. Namecheap remains the registrar and DNS provider; no nameserver, registrant, or email-service change was made.

The website host records are the following [GitHub-recommended records](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site):

| Type | Host | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `sharekeeper.github.io.` |

Both previous URL Redirect records were replaced, not retained alongside these records. The existing Namecheap Email Forwarding selection and SPF TXT record (`v=spf1 include:spf.efwd.registrar-servers.com ~all`) were left intact. GitHub handles the `www` redirect to the apex; no wildcard DNS record is needed.

- **Certificate gate:** GitHub manages the custom-domain certificate. During initial issuance, the Pages API can show `https_certificate: null` and `https_enforced: false`; this is not a completed secure launch. Confirm a ready certificate, a normal anonymous HTTPS load, and the current sample PDF before enabling HTTPS enforcement and reporting completion, following the [GitHub Pages HTTPS guidance](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).
- **Workflow behavior:** Custom GitHub Actions deployments do not require a `CNAME` file; GitHub ignores that file for this publishing method. Preserve the Pages API's custom-domain configuration across future releases, as documented in [GitHub's custom-domain guide](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
- **Ownership hardening:** GitHub Pages organization-level TXT verification is recommended but has not been completed. Retrieve the exact Pages-specific challenge from the organization's Pages settings when arranging that hardening; never invent a token or substitute a generic organization-identity verification token. Verification reduces domain-takeover risk, as described in the [domain verification guide](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages).
- **Perplexity independence:** The production domain no longer forwards to `sharekeeper.pplx.app`. Making the Perplexity library artifact public did not clear that published site's separate access gate, so its visibility must not be treated as evidence that the production domain works or fails.

## Independent public HTTPS deployment

The [standalone recovery app](https://sharekeeper.github.io/sharekeeper-app/recovery.html) and its [portal](https://sharekeeper.github.io/sharekeeper-app/) are also published from the separate [built-distribution repository](https://github.com/sharekeeper/sharekeeper-app). This project has no custom domain and uses GitHub's existing HTTPS domain, so it remains usable independently of the `sharekeeper.org` certificate.

The canonical editable source remains this repository. The distribution mirror contains only the four reviewed `dist` files and `.nojekyll`, not a second source implementation or any private provider responses. Its Pages deployment currently uses the root of `main`. When refreshing that mirror, copy a tested, complete build from this repository, verify all four deployed file hashes and actual anonymous HTTPS behavior, and do not assume a source push automatically refreshed the mirror.
