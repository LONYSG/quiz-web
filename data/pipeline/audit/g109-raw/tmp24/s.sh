#!/bin/bash
# usage: s.sh file regex
grep -n -E "$2" "$1" | cut -c1-450 | head -${3:-8}
