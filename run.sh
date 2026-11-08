#!/bin/sh
# Entrypoint for the server jobs. Jobs always run in this order; a failing job doesn't stop the next.
#   --uhd-posters   stamp uhd.png on 4K movie posters in Plex   (uhd-posters.sh)
#   --publish-site  scan Plex, commit and push the static site   (publish-site.sh)
cd "$(dirname "$0")"
usage() { echo "usage: $0 [--uhd-posters] [--publish-site]"; exit 1; }

posters= site= rc=0
[ $# -gt 0 ] || usage
for a; do
	case $a in
		--uhd-posters) posters=1 ;;
		--publish-site) site=1 ;;
		*) usage ;;
	esac
done

if [ -n "$posters" ]; then ./uhd-posters.sh || rc=1; fi
if [ -n "$site" ]; then ./publish-site.sh || rc=1; fi
exit $rc
