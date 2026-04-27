#!/usr/bin/env bash
# Run this after `npx expo prebuild --platform ios` or after `pod install`.
# Applies two patches that are required to build this project on Xcode 26+:
#   1. Disable fmt library's consteval (broken with newer clang)
#   2. Disable User Script Sandboxing in the Xcode project (Expo's bundle
#      script writes ip.txt into the app bundle, which the sandbox blocks)
set -e

IOS_DIR="$(cd "$(dirname "$0")/../ios" && pwd)"
cd "$IOS_DIR"

# 1. fmt consteval
FMT_BASE="Pods/fmt/include/fmt/base.h"
if [ -f "$FMT_BASE" ]; then
  if ! grep -q "patched" "$FMT_BASE"; then
    sed -i '' 's|^#if FMT_USE_CONSTEVAL$|#if 0 // patched: disable consteval for Xcode 26 compat|' "$FMT_BASE"
    echo "Patched $FMT_BASE"
  else
    echo "$FMT_BASE already patched"
  fi
else
  echo "Skipping fmt patch: $FMT_BASE not found (run pod install first)"
fi

# 2. Disable User Script Sandboxing
PBXPROJ="AgroField.xcodeproj/project.pbxproj"
if grep -q "ENABLE_USER_SCRIPT_SANDBOXING = YES" "$PBXPROJ"; then
  sed -i '' 's|ENABLE_USER_SCRIPT_SANDBOXING = YES|ENABLE_USER_SCRIPT_SANDBOXING = NO|g' "$PBXPROJ"
  echo "Disabled USER_SCRIPT_SANDBOXING in $PBXPROJ"
else
  echo "$PBXPROJ already has USER_SCRIPT_SANDBOXING disabled"
fi

echo "Done."
