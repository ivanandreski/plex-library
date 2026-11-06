import { start, esc, num, plural, minutes, bytes, thumb, rating, seasonBrowser, countTag, countSeen, SORTS, RESOLUTIONS, RANGES } from "./core.js";

const $ = s => document.querySelector(s);
const SIGNS = 8; // aisle signs visible before the "more" overflow
let moreAisles = false;

const sign = (act, v, label, cur) => `<button data-do="${act}" data-v="${esc(v)}"${cur ? ' class="on"' : ""}>${esc(label)}</button>`;
const group = (title, body) => `<div class="group"><span>${title}</span>${body}</div>`;
const chips = (app, act, key, values, count, label = v => v) => sign(act, "all", "All", app.f[key] == "all") +
	values.filter(v => count(v)).map(v => sign(act, v, label(v), app.f[key] == v)).join("");

// active filters shown as removable chips (value = what "cleared" means)
const CLEAR = { term: "", genre: "all", director: "all", seen: "all", resolution: "all", range: "all" };
const CHIP = { term: v => `Search: “${v}”`, genre: v => `Aisle: ${v}`, director: v => `Directed by ${v}`, seen: v => (v == "true" ? "Seen" : "Not seen"), resolution: v => v, range: v => v };
// spec badges: [main text, small text, extra class]
const RES_BADGE = { "4K": ["4K", "Ultra HD"], "1080p": ["1080p", "Full HD"], "720p": ["720p", "HD"], "480p": ["480p", "SD"] };
const RANGE_BADGE = { "Dolby Vision": ["Dolby Vision"], "HDR10+": ["HDR10+"], HDR: ["HDR10"] };
const AUDIO = { ac3: "Dolby Digital", eac3: "Dolby Digital+", truehd: "Dolby TrueHD", dca: "DTS", dts: "DTS", aac: "AAC", flac: "FLAC", opus: "Opus", mp3: "MP3" };
const VIDEO = { hevc: "HEVC", h264: "H.264", av1: "AV1", vp9: "VP9", mpeg4: "MPEG-4", vc1: "VC-1" };
const CH = { 1: "Mono", 2: "Stereo", 6: "5.1", 8: "7.1" };
// old data.json has no `resolutions`; fall back to the media height (Plex "4k" parses as 4)
const tiers = it => it.resolutions?.length ? it.resolutions : it.media?.video_resolution > 0 ? [it.media.video_resolution < 100 || it.media.video_resolution >= 2160 ? "4K" : it.media.video_resolution >= 1000 ? "1080p" : it.media.video_resolution >= 700 ? "720p" : "480p"] : [];
const badges = it => {
	const m = it.media, b = [
		it.content_rating && [it.content_rating, "Rated", "rated"],
		...tiers(it).map(v => RES_BADGE[v]),
		...(it.dynamic_ranges || []).map(v => RANGE_BADGE[v]),
		m && [AUDIO[m.audio_codec] || String(m.audio_codec).toUpperCase(), CH[m.audio_channels] && CH[m.audio_channels] + " audio"],
		m && m.video_codec && [VIDEO[m.video_codec] || String(m.video_codec).toUpperCase()],
	].filter(Boolean);
	return b.map(([t, sub, cls = ""]) => `<span class="badge ${cls}"><b>${esc(t)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>`).join("");
};
let lastList, shownKey;
const render = app => {
	const { section: s, f } = app, movie = s.type == "movie";

	$("#tabs").innerHTML = app.data.section_display_order.map(k => sign("section", k, app.data.sections[k].title, app.data.sections[k] == s)).join("");

	const genres = s.genres || [], shown = moreAisles ? genres : genres.slice(0, SIGNS);
	$("#aisles").innerHTML = sign("genre", "all", "All aisles", f.genre == "all") + shown.map(g => sign("genre", g.genre, g.genre, f.genre == g.genre)).join("") +
		(genres.length > SIGNS ? `<button data-do="more">${moreAisles ? "fewer" : `more (${genres.length - SIGNS})`}</button>` : "");

	$("#active").innerHTML = Object.entries(CLEAR).filter(([k, d]) => f[k] !== d).map(([k]) =>
		`<button data-do="clear" data-v="${k}">${esc(CHIP[k](f[k]))} ✕</button>`).join("");

	$("#drawer").innerHTML =
		(movie ? group("Resolution", chips(app, "res", "resolution", RESOLUTIONS, v => countTag(s, "resolutions", v))) +
			group("Range", chips(app, "range", "range", RANGES, v => countTag(s, "dynamic_ranges", v))) : "") +
		group("Sort", SORTS.map(([k, l]) => sign("sort", k, l.replace("By ", "") + (f.sortKey == k ? (f.sortOrder == "asc" ? " ↑" : " ↓") : ""), f.sortKey == k)).join("")) +
		(movie ? group("Be kind, rewind", sign("seen", "all", "All", f.seen == "all") + sign("seen", "true", `Seen (${countSeen(s, "true")})`, f.seen == "true") + sign("seen", "false", `Not seen (${countSeen(s, "false")})`, f.seen == "false")) : "") +
		"";

	if (app.list !== lastList) {
		lastList = app.list;
		$("#count").textContent = app.list.length ? `${num(app.list.length)} ${plural(app.list.length, "title")} on the shelf` : "Nothing on this shelf.";
		$("#grid").innerHTML = app.list.map(it => `<li data-do="item" data-v="${it.key}" title="${esc(it.title)} (${esc(it.release_year)})" style="--art:url('${esc(new URL(thumb(it), location.href).href)}')"><img src="${esc(thumb(it))}" alt="${esc(it.title)}" loading="lazy" /></li>`).join("");
	}

	const dlg = $("#popup");
	if (!app.item) { shownKey = null; if (dlg.open) dlg.close(); return; }
	if (app.key == shownKey) return;
	shownKey = app.key;
	dlg.innerHTML = box(app);
	if (!dlg.open) dlg.showModal();
	const el = dlg.querySelector(".box");
	void el.offsetWidth; // commit the front-facing state, then turn the box over
	el.classList.add("flipped");
};

// back of the box
const box = app => {
	const it = app.item, [prev, next] = app.neighbors(), m = it.media, r = rating(it);
	const spec = (k, v) => v ? `<span class="stat"><small>${k}</small> <b>${esc(v)}</b></span>` : "";
	const names = (label, list, act) => list ? `<p><b>${label}</b> ${list.map(n => act ? `<a href="#" data-do="${act}" data-v="${esc(n)}">${esc(n)}</a>` : esc(n)).join(", ")}</p>` : "";
	return `<div class="box"><img class="front" src="${esc(thumb(it))}" alt="" /><div class="back"><article>
		<button class="close" data-do="close" aria-label="Close">✕</button>
		<h2>${esc(it.title)}</h2>
		${it.tagline ? `<p class="tag">${esc(it.tagline)}</p>` : ""}
		${r ? `<span class="star">★ ${(Math.round(r * 10) / 10).toFixed(1)}</span>` : ""}
		<div class="cols">
			<img src="${esc(thumb(it))}" alt="" />
			<div>
				${it.summary ? `<p>${esc(it.summary)}</p>` : ""}
				${names("Starring", it.role?.slice(0, 20))}${names("Directed by", it.director, "by")}${names("Genre", it.genre)}
			</div>
		</div>
		<div class="specs"><h3>Tech specs</h3>
			<div class="badges">${badges(it)}</div>
			<div class="stats">${spec("Size", m?.total_size && bytes(m.total_size))}${spec("Runtime", it.duration > 0 && `${minutes(it.duration)} min`)}${spec("Seasons", it.num_seasons > 0 && `${it.num_seasons} (${it.num_episodes} episodes)`)}</div>
		</div>
		${it.num_seasons > 0 ? seasonBrowser(it) : ""}
		<footer>
			<span class="barcode" aria-hidden="true"></span>
		</footer>
		<nav>${prev ? `<a href="#" data-do="item" data-v="${prev.key}">&laquo; ${esc(prev.title)}</a>` : "<span></span>"}${next ? `<a href="#" data-do="item" data-v="${next.key}">${esc(next.title)} &raquo;</a>` : ""}</nav>
	</article></div></div>`;
};

const app = await start(render);
app.acts.more = () => { moreAisles = !moreAisles; render(app); };
// director link narrows the current view; the chips above the shelf show what is active
app.acts.by = v => app.set({ director: v });
app.acts.clear = k => { if (k == "term") $("#search").value = ""; app.set({ [k]: CLEAR[k] }); };
app.acts.drawer = () => document.body.classList.toggle("drawer-open");
$("#search").value = app.f.term;
$("#search").addEventListener("input", e => app.set({ term: e.target.value }));
$("#popup").addEventListener("click", e => { if (e.target.id == "popup") app.close(); else if (e.target.closest("a[href='#']")) e.preventDefault(); });
$("#popup").addEventListener("close", () => app.key && app.close());
