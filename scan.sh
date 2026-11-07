#!/bin/sh
# Scan a Plex server and write plex-data/data.json (+ thumbnails) for the static site.
# Env: PLEX_ADDRESS (e.g. http://192.168.1.108:32400), PLEX_TOKEN, SKIP_THUMBS=true (no thumbnail downloads)
set -eu
cd "$(dirname "$0")"
: "${PLEX_ADDRESS:?PLEX_ADDRESS is required}"
BASE=${PLEX_ADDRESS%/}
DATA_DIR=plex-data
TAB=$(printf '\t')
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

log() { echo "$(date +%H:%M:%S) $*"; }
plex() { curl -fsS --retry 2 -H 'Accept: application/json' -H "X-Plex-Token: ${PLEX_TOKEN:-}" "$BASE/$1"; }

# $1 = item key, $2 = url-encoded source thumb url (or "-"); prints relative path or nothing
thumb() {
	f="$DATA_DIR/thumb_$1.jpeg"
	if [ ! -e "$f" ] && [ "$2" != - ] && [ "${SKIP_THUMBS:-false}" != true ]; then
		plex "photo/:/transcode?width=150&height=250&url=$2" > "$f.part" && mv "$f.part" "$f" \
			|| { rm -f "$f.part"; log "Error: could not load thumbnail for $1"; }
	fi
	if [ -e "$f" ]; then echo "$f"; fi
}

LIB='
def f(x): if x == null or x == "" then false else x end;
def n(x): if x == null or x == "" then false else (x|tonumber) end;
def i(x): (x // 0) | tonumber;
def tags(x): if (x // []) | length > 0 then [x[].tag] else false end;
def th($t): if $t == "" then false else $t end;
def obj(a): if (a|length) == 0 then [] else (a | map({key: (.key|tostring), value: .}) | from_entries) end;
def skipword: ascii_downcase | split(" ") as $w
	| if ($w|length) > 1 and ($w[0] | IN("a","the","der","die","das")) then $w[1:] | join(" ") else . end;

def tier: (.videoResolution // "" | tostring) | if . == "4k" then "4K" elif . == "1080" then "1080p" elif . == "720" then "720p" else "480p" end;
def range: ([(.Part // [])[].Stream // [] | .[] | select(.streamType == 1)]) as $v
	| if any($v[]; .DOVIPresent == true) then "Dolby Vision"
	elif any($v[]; ((.displayTitle // "") + (.extendedDisplayTitle // "")) | test("HDR10\\+")) then "HDR10+"
	elif any($v[]; .colorTrc | IN("smpte2084", "arib-std-b67")) then "HDR"
	else "SDR" end;

def movie($t): (.Media // [])[0] as $m | {
	key: (.ratingKey|tonumber), type: "movie", thumb: th($t), title,
	duration: i(.duration), view_count: i(.viewCount), tagline: f(.tagline),
	rating: n(.rating), user_rating: n(.userRating), release_year: n(.year),
	release_date: f(.originallyAvailableAt), addedAt: i(.addedAt),
	content_rating: f(.contentRating), summary: f(.summary), studio: f(.studio),
	genre: tags(.Genre), director: tags(.Director), role: tags(.Role),
	resolutions: ([(.Media // [])[] | tier] | unique),
	dynamic_ranges: ([(.Media // [])[] | range] | unique),
	media: (if i($m.duration) > 0 then {
		bitrate: n($m.bitrate), aspect_ratio: n($m.aspectRatio), audio_channels: n($m.audioChannels),
		audio_codec: f($m.audioCodec), video_codec: f($m.videoCodec),
		video_resolution: (if $m.videoResolution == null then false
			else (($m.videoResolution|tostring|capture("^(?<d>[0-9]+)")|.d|tonumber) // 0) end),
		video_framerate: f($m.videoFrameRate),
		total_size: ([($m.Part // [])[].size // 0] | add // 0 | if . > 0 then . else false end)
	} else false end)
};

def season($s): [.MediaContainer.Metadata[]? | select(.type == "episode") | {
		key: (.ratingKey|tonumber), title: (.title // ""), index: i(.index), summary: (.summary // ""),
		rating: i(.rating), duration: i(.duration), view_count: i(.viewCount)
	}] as $e | {
	key: ($s.ratingKey|tonumber), title: $s.title, num_episodes: i($s.leafCount),
	actual_episodes: ($e|length), episodes: obj($e), index: i($s.index),
	episode_sort_order: ($e | sort_by(.index) | map(.key))
};

def show($t; $seasons): {
	key: (.ratingKey|tonumber), type: "show", thumb: th($t), title,
	rating: n(.rating), user_rating: n(.userRating), release_year: n(.year),
	release_date: f(.originallyAvailableAt), duration: i(.duration),
	content_rating: f(.contentRating), summary: f(.summary), studio: f(.studio),
	tagline: false, num_episodes: i(.leafCount), num_seasons: ($seasons|length), seasons: obj($seasons)
} + (if (.Genre // []) | length > 0 then {genre: [.Genre[].tag]} else {} end)
  + {season_sort_order: ($seasons | sort_by(.index) | map(.key))};

def section($sec): . as $all | def s(f): $all | sort_by(f) | map(.key);
	if length == 0 then $sec + {num_items: 0, items: []} else $sec + {
		num_items: length, items: obj($all),
		sorts: ({title: s(.title|skipword), release: s(.release_date // ""), addedAt: s(.addedAt // 0),
				rating: s(if .user_rating then .user_rating else (.rating // 0) end)}
			| to_entries | map({key: (.key + "_asc"), value}, {key: (.key + "_desc"), value: (.value|reverse)})
			| from_entries),
		genres: (reduce ($all[].genre | arrays | .[]) as $g ({}; .[$g] += 1)
			| to_entries | sort_by(-.value) | map({genre: .key, count: .value}))
	} end;
'

log "Searching for sections in the Plex library at $BASE"
plex library/sections > "$TMP/sections.json"
jq -r '.MediaContainer.Directory[]? | [.key, .type, .title] | @tsv' "$TMP/sections.json" > "$TMP/sections.tsv"
: > "$TMP/sections.jsonl"

while IFS="$TAB" read -r sk stype stitle; do
	case $stype in movie|show) ;; *) log "Skipping section of unknown type: $stype"; continue ;; esac
	log "Scanning section: $stitle"
	if ! plex "library/sections/$sk/all" > "$TMP/all.json"; then
		log "Error: could not load items for $stitle"; echo '{}' > "$TMP/all.json"
	fi
	jq -r --arg base "$BASE" '.MediaContainer.Metadata[]?
		| [.ratingKey, (if .thumb then ($base + .thumb | @uri) else "-" end), .title] | @tsv' \
		"$TMP/all.json" > "$TMP/items.tsv"
	: > "$TMP/items"

	while IFS="$TAB" read -r key th title; do
		log "Scanning $stype: $title"
		t=$(thumb "$key" "$th")
		pick=".MediaContainer.Metadata[] | select(.ratingKey == \"$key\")"
		if [ "$stype" = movie ]; then
			# full metadata has all genres/directors/roles; fall back to the list entry
			{ plex "library/metadata/$key" || jq "{MediaContainer: {Metadata: [$pick]}}" "$TMP/all.json"; } \
				| jq -c --arg t "$t" "$LIB .MediaContainer.Metadata[0] | movie(\$t)" >> "$TMP/items"
		else
			: > "$TMP/seasons"
			plex "library/metadata/$key/children" > "$TMP/children.json" || echo '{}' > "$TMP/children.json"
			jq -r '.MediaContainer.Metadata[]? | select(.type == "season") | .ratingKey' "$TMP/children.json" > "$TMP/seasons.txt"
			while read -r s; do
				{ plex "library/metadata/$s/children" || echo '{}'; } \
					| jq -c --argjson s "$(jq -c ".MediaContainer.Metadata[] | select(.ratingKey == \"$s\")" "$TMP/children.json")" \
						"$LIB season(\$s)" >> "$TMP/seasons"
			done < "$TMP/seasons.txt"
			jq -c --arg t "$t" --slurpfile seasons "$TMP/seasons" "$LIB $pick | show(\$t; \$seasons)" "$TMP/all.json" >> "$TMP/items"
		fi
	done < "$TMP/items.tsv"

	jq -sc --argjson sec "$(jq -nc --arg k "$sk" --arg ty "$stype" --arg ti "$stitle" '{key: ($k|tonumber), type: $ty, title: $ti}')" \
		"$LIB section(\$sec)" "$TMP/items" >> "$TMP/sections.jsonl"
	log "Added $(wc -l < "$TMP/items" | tr -d ' ') items from $stitle"
done < "$TMP/sections.tsv"

if [ ! -s "$TMP/sections.jsonl" ]; then log "Error: no valid sections found, aborting"; exit 1; fi

{
	jq -sjac --argjson ts "$(date +%s)000" --arg upd "last updated : $(date '+%Y-%m-%d - %H:%M')" '{
		status: "success", version: 1, last_generated: $ts, last_updated: $upd,
		total_items: (map(if .num_items == 0 then 0 elif .type == "show" then ([.items[].num_episodes] | add) else .num_items end) | add),
		num_sections: length,
		section_display_order: map(select(.num_items > 0) | .key),
		sections: (map({key: (.key|tostring), value: .}) | from_entries)
	}' "$TMP/sections.jsonl"
} > "$TMP/data.json"
mv "$TMP/data.json" "$DATA_DIR/data.json"
log "Wrote $(wc -c < "$DATA_DIR/data.json" | tr -d ' ') bytes to $DATA_DIR/data.json"
