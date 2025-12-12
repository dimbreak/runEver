#!/bin/sh

if [ -z "$husky_skip_init" ]; then
  husky_skip_init=1
  if [ "$0" = "/bin/sh" ]; then
    # shellcheck disable=SC2006
    case "$*" in
    *husky-run*) ;; # sourced by husky-run, do nothing
    *) set -- sh "$@";;
    esac
  fi
  if command -v husky > /dev/null 2>&1; then
    husky runner "$@"
    exit $?
  fi
  if [ -x "$(dirname "$0")/husky.sh" ]; then
    . "$(dirname "$0")/husky.sh"
  fi
fi
