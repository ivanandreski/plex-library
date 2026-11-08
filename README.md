# plex-library

To get a plex token visit: https://app.plex.tv/desktop/#!/
click on any movie, 3 dots, get info, view xml, X-PLex-Token will be in the url
Config: `cp .env.example .env` and fill it in (used by docker-compose).

Jobs: `./run.sh [--uhd-posters] [--publish-site]` (pick them with `command:` in docker-compose.yml)
- `--uhd-posters`: stamp `assets/images/uhd.png` on 4K movie posters in Plex and lock them (labelled `overlay-4k`; `ONLY=<ratingKey>` to test on one movie)
- `--publish-site`: scan Plex into `plex-data/`, commit and push the static site
