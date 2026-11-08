#!/bin/sh
# Stamp assets/images/uhd.png across the top of every 4K movie poster in Plex, upload it as the poster and lock it.
# Stamped movies get the label overlay-4k so re-runs skip them; the original stays under Edit -> Poster.
# Env: PLEX_ADDRESS, PLEX_TOKEN, ONLY=<ratingKey> (stamp just that movie, skipping the 4K check)
set -eu
cd "$(dirname "$0")"
: "${PLEX_ADDRESS:?PLEX_ADDRESS is required}"
BASE=${PLEX_ADDRESS%/}
LABEL=overlay-4k
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

log() { echo "$(date +%H:%M:%S) $*"; }
# $1 = path, rest = extra curl args
plex() { p=$1; shift; curl -fsS --retry 2 -H 'Accept: application/json' -H "X-Plex-Token: ${PLEX_TOKEN:-}" "$@" "$BASE/$p"; }

stamp() {
	key=$1
	plex "library/metadata/$key" > "$TMP/meta.json" || return 1
	jq -r --arg l "$LABEL" '.MediaContainer.Metadata[0] | [any(.Label[]?; (.tag | ascii_downcase) == $l), .librarySectionID, .thumb, .title] | @tsv' \
		"$TMP/meta.json" > "$TMP/row" || return 1
	IFS="$TAB" read -r stamped sec thumb title < "$TMP/row"
	if [ "$stamped" = true ]; then log "Already stamped: $title"; return 0; fi
	log "Stamping: $title"

	plex "${thumb#/}" -o "$TMP/poster" || return 1
	# badge on top pushes the poster down; trim the bottom back to the original size so the aspect ratio stays
	size=$(magick identify -format %wx%h "$TMP/poster") || return 1
	magick \( assets/images/uhd.png -resize "${size%x*}x" \) "$TMP/poster" -append -crop "$size+0+0" +repage -quality 92 "$TMP/out.jpg" || return 1
	plex "library/metadata/$key/posters" -X POST --data-binary @"$TMP/out.jpg" > /dev/null || return 1

	# lock the poster and set labels in one edit; Plex replaces the label list, so resend the existing ones
	set -- -X PUT -G --data-urlencode type=1 --data-urlencode "id=$key" --data-urlencode thumb.locked=1
	jq -r --arg l "$LABEL" '[(.MediaContainer.Metadata[0].Label // [])[].tag, $l] | to_entries[] | "label[\(.key)].tag.tag=\(.value)"' \
		"$TMP/meta.json" > "$TMP/labels" || return 1
	while IFS= read -r a; do set -- "$@" --data-urlencode "$a"; done < "$TMP/labels"
	plex "library/sections/$sec/all" "$@" > /dev/null || return 1

	# write the site thumbnail too (same 150x250 box as scan.sh); the scan keeps existing ones, even with SKIP_THUMBS
	magick "$TMP/out.jpg" -resize 150x250 "plex-data/thumb_$key.jpeg" || return 1
}

TAB=$(printf '\t')
if [ -n "${ONLY:-}" ]; then
	echo "$ONLY" > "$TMP/ids"
else
	log "Looking for 4K movies at $BASE"
	plex library/sections | jq -r '.MediaContainer.Directory[]? | select(.type == "movie") | .key' > "$TMP/sections"
	while read -r s; do
		plex "library/sections/$s/all" | jq -r '.MediaContainer.Metadata[]? | select(any(.Media[]?; .videoResolution == "4k")) | .ratingKey'
	done < "$TMP/sections" > "$TMP/ids"
fi
log "Found $(wc -l < "$TMP/ids" | tr -d ' ') candidate(s)"

rc=0
while read -r id; do
	stamp "$id" || { log "Error: could not stamp $id"; rc=1; }
done < "$TMP/ids"
exit $rc
