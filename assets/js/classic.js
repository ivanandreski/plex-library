import { start, esc, num, plural, minutes, bytes, thumb, rating, seasonBrowser, directors, countTag, countSeen, all, SORTS, RESOLUTIONS, RANGES } from "./core.js";

const $ = s => document.querySelector(s);
const SHOWN = 5; // list entries visible before "Show N more..."
const expanded = { genres: false, directors: false };
const li = (act, v, label, n, cur) => `<li data-do="${act}" data-v="${esc(v)}"${cur ? ' class="current"' : ""}>${n == null ? "" : `<em>${num(n)}</em>`}${esc(label)}</li>`;
const more = (name, rows) => rows.map((r, i) => i < SHOWN || expanded[name] ? r : "").join("") +
	(rows.length > SHOWN ? `<li data-do="more" data-v="${name}">${expanded[name] ? "Show fewer..." : `Show ${rows.length - SHOWN} more...`}</li>` : "");

// one filter list: "All" row plus one row per value that has items
const tagList = (app, act, key, values, count) => li(act, "all", "All", all(app.section).length, app.f[key] == "all") +
	values.map(v => [v, count(v)]).filter(x => x[1]).map(([v, n]) => li(act, v, v, n, app.f[key] == v)).join("");

let lastList;
const render = app => {
	const { section: s, f } = app, movie = s.type == "movie";
	$("#sections").innerHTML = app.data.section_display_order.map(k => {
		const x = app.data.sections[k];
		return `<li data-do="section" data-v="${k}" class="${x.type}${x == s ? " current" : ""}"><em>${num(x.num_items)}</em><span>${esc(x.title)}</span></li>`;
	}).join("");
	$("#sorts").innerHTML = SORTS.map(([k, l]) => `<li data-do="sort" data-v="${k}"${f.sortKey == k ? ' class="current"' : ""}>${f.sortKey == k ? `<em>${f.sortOrder}</em>` : ""}${l}</li>`).join("");

	for (const id of ["resolution", "range", "seen"]) $(`#${id}-box`).hidden = !movie;
	$("#resolutions").innerHTML = tagList(app, "res", "resolution", RESOLUTIONS, v => countTag(s, "resolutions", v));
	$("#ranges").innerHTML = tagList(app, "range", "range", RANGES, v => countTag(s, "dynamic_ranges", v));
	$("#seen").innerHTML = li("seen", "all", "All", s.num_items, f.seen == "all") + li("seen", "true", "Seen", countSeen(s, "true"), f.seen == "true") + li("seen", "false", "Not Seen", countSeen(s, "false"), f.seen == "false");

	$("#genre-box").hidden = !(s.genres?.length);
	$("#genres").innerHTML = li("genre", "all", "All", s.num_items, f.genre == "all") + more("genres", (s.genres || []).map(g => li("genre", g.genre, g.genre, g.count, f.genre == g.genre)));
	const dirs = directors(s, f.genre);
	$("#director-box").hidden = !dirs.length;
	$("#directors").innerHTML = li("director", "all", "All", dirs.reduce((n, d) => n + d[1], 0), f.director == "all") + more("directors", dirs.map(([d, n]) => li("director", d, d, n, f.director == d)));

	if (app.list !== lastList) {
		lastList = app.list;
		$("#section-header h2").textContent = s.title;
		$("#section-header p").textContent = app.list.length ? `${num(app.list.length)} ${plural(app.list.length, "item")} in this collection` : "No items in this collection";
		$("#item-list-status").hidden = app.list.length > 0;
		$("#item-list-status").innerHTML = "<p>There are no items to display in this collection.</p>";
		$("#item-list ul").innerHTML = app.list.map(it => `<li data-do="item" data-v="${it.key}" class="item"><img src="${esc(thumb(it))}" width="150" loading="lazy" /><h4>${esc(it.title)}</h4><h4>${esc(it.release_year)}</h4></li>`).join("");
	}

	const dlg = $("#popup");
	if (app.item) { dlg.innerHTML = popup(app); if (!dlg.open) dlg.showModal(); }
	else if (dlg.open) dlg.close();
};

const popup = app => {
	const it = app.item, [prev, next] = app.neighbors(), r = rating(it), m = it.media;
	const meta = [
		it.duration > 0 && `Duration: ${minutes(it.duration)} ${plural(minutes(it.duration), "minute")}`,
		it.studio && `Studio: ${esc(it.studio)}`, it.release_year && `Released: ${it.release_year}`, it.content_rating && `Rated: ${esc(it.content_rating)}`,
		it.num_seasons > 0 && `Seasons: ${it.num_seasons}`, it.num_episodes > 0 && `Episodes: ${it.num_episodes}`,
		it.view_count > 0 && `Watched: ${it.view_count} ${plural(it.view_count, "time")}`,
	].filter(Boolean).map(x => `<li>${x}</li>`).join("");
	const details = [
		it.director && ["Directed by", it.director.map(esc).join(", ")], it.role && ["Starring", it.role.map(esc).join(", ")], it.genre && ["Genre", it.genre.map(esc).join(", ")],
		m && ["Video", `codec: ${esc(m.video_codec)}, framerate: ${esc(m.video_framerate)}${m.video_resolution > 0 ? `, vert: ${m.video_resolution}` : ""}${m.aspect_ratio > 0 ? `, aspect ratio: ${m.aspect_ratio}` : ""}`],
		m && ["Audio", `codec: ${esc(m.audio_codec)}, channels: ${esc(m.audio_channels)}`],
		m?.total_size && ["File", `${bytes(m.total_size)} @ ${m.bitrate}bps`],
	].filter(Boolean).map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`).join("");
	return `<div id="popup-card-container">
		<div id="popup-header"><p class="right"><span data-do="close">Close</span></p><p>Library &raquo; ${esc(app.section.title)} &raquo; ${esc(it.title)}</p></div>
		<div id="popup-outer"><div id="popup-inner">
			<div id="popup-sidebar"><img src="${esc(thumb(it))}" width="150" /><ul>${meta}</ul></div>
			<div id="popup-content">
				${r ? `<span class="rating rating_${it.user_rating ? "user" : "plex"} rating_${Math.round(r) / 2 * 10}"></span>` : ""}
				<h3>${esc(it.title)}</h3>${it.tagline ? `<h4>${esc(it.tagline)}</h4>` : ""}
				${it.summary ? `<div id="popup-summary"><p>${esc(it.summary)}</p></div>` : ""}
				${details ? `<ul id="popup-content-meta">${details}</ul>` : ""}
				${it.num_seasons > 0 ? seasonBrowser(it) : ""}
			</div>
		</div>
		<div id="popup-footer">
			${next ? `<span class="right" data-do="item" data-v="${next.key}">${esc(next.title)} &raquo;</span>` : ""}
			${prev ? `<span data-do="item" data-v="${prev.key}">&laquo; ${esc(prev.title)}</span>` : ""}
		</div></div></div>`;
};

const app = await start(render);
// the sidebar director list is per genre, so picking a genre resets the director
app.acts.genre = v => app.set({ genre: v, director: "all" });
app.acts.more = v => { expanded[v] = !expanded[v]; render(app); };
app.acts.menu = () => document.body.classList.toggle("menu-open");
$("#section-header input").value = app.f.term;
$("#section-header input").addEventListener("input", e => app.set({ term: e.target.value }));
$("#popup").addEventListener("click", e => e.target.id == "popup" && app.close()); // backdrop click
$("#popup").addEventListener("close", () => app.key && app.close()); // native Esc
