#!/bin/bash
# usage: run.sh script.mjs args...   (serves the repo while the script runs)
python3 -m http.server 8765 --directory /home/claude/the-duel >/dev/null 2>&1 &
SP=$!; sleep 0.7
node "$@"; RC=$?
kill $SP 2>/dev/null; exit $RC
