fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios build

```sh
[bundle exec] fastlane ios build
```

Dry archive — sanity check, no upload

### ios setup_certs

```sh
[bundle exec] fastlane ios setup_certs
```

One-time: install Dev + Distribution certs locally for this Mac

### ios internal

```sh
[bundle exec] fastlane ios internal
```

Build + upload to TestFlight Internal group (no review)

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
