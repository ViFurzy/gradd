# Homebrew tap

`gradd.rb.template` is the cask source. The `Release macOS` workflow renders it
(`__VERSION__`, `__SHA256__`) and pushes it to the tap `ViFurzy/homebrew-gradd`.

## One-time setup

1. Create the PUBLIC repo `ViFurzy/homebrew-gradd` with an initial commit (a README is enough; the workflow creates `Casks/gradd.rb`).
2. Create a fine-grained PAT: resource owner ViFurzy, repository access "Only select repositories" = `homebrew-gradd`, permission Contents: Read and write, nothing else.
3. Save it in ViFurzy/gradd -> Settings -> Secrets and variables -> Actions as `HOMEBREW_TAP_TOKEN`.

Without the secret the workflow still uploads the mac assets and just skips the tap.

## Release

1. Bump `version` in package.json, commit.
2. `git tag vX.Y.Z && git push origin vX.Y.Z`. The tag must equal `v` + package.json version or the build job fails.
3. CI builds the unsigned universal app, verifies it and uploads the DMG, mac zip and `latest-mac.yml` to the release for that tag (a DRAFT is created if none exists).
4. Add the Windows assets and release notes as usual.
5. Publish the release in the GitHub UI. Publishing triggers the `tap` job, which downloads the DMG, computes its sha256 and pushes the cask to the tap. (Draft assets are not public, so the tap is deliberately not updated at tag time. Prereleases are skipped.)

## Install

    brew install --cask vifurzy/gradd/gradd

Upgrade with `brew upgrade --cask gradd`.

## Test the cask locally (on a Mac)

The url must point to an already published release.

    sed -e "s/__VERSION__/1.5.1/" -e "s/__SHA256__/$(shasum -a 256 dist/gradd-app-1.5.1-universal.dmg | cut -d' ' -f1)/" packaging/homebrew/gradd.rb.template > gradd.rb
    ruby -c gradd.rb
    brew tap-new local/gradd --no-git
    cp gradd.rb "$(brew --repository local/gradd)/Casks/"
    brew audit --cask --strict local/gradd/gradd
    brew install --cask local/gradd/gradd
    brew uninstall --zap --cask gradd
    brew untap local/gradd

## When Apple signing exists

Follow the signing comments in `.github/workflows/release-mac.yml`, then in the template remove the `postflight` block and add `auto_updates true`.
