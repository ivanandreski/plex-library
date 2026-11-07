// Shared, dependency-free logic for classic.html and index.html.
// Pages only render: start(render) calls render(app) after every state change.

export const SORTS = [["title", "By title"], ["rating", "By rating"], ["release", "By release date"], ["addedAt", "By recently added"]];
export const RESOLUTIONS = ["4K", "1080p", "720p", "480p"];
export const RANGES = ["Dolby Vision", "HDR10+", "HDR", "SDR"];

// ---- helpers ----
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const num = n => Number(n).toLocaleString("en-US");
export const plural = (n, w) => (n == 1 ? w : w + "s");
export const minutes = ms => Math.round(ms / 60000);
export const bytes = b => {
	for (const u of ["b", "Kb", "Mb", "Gb"]) { if (b < 1024) return `${Math.round(b * 100) / 100} ${u}`; b /= 1024; }
	return `${Math.round(b * 100) / 100} Pb`;
};
export const epTag = (s, e) => `S${String(s.index).padStart(2, "0")}E${String(e.index).padStart(2, "0")}`;
export const thumb = it => it.thumb || "assets/images/default.png";
export const rating = it => (it.user_rating || it.rating || 0); // 0-10, 0 = none

// ---- filtering ----
const fresh = () => ({ term: "", genre: "all", director: "all", seen: "all", resolution: "all", range: "all", sortKey: "title", sortOrder: "asc" });
const has = (arr, v) => Array.isArray(arr) && arr.includes(v);
// filters live in the query string (?genre=Drama&sort=rating); section/item stay in the hash
const PARAMS = { term: "q", genre: "genre", director: "director", seen: "seen", resolution: "res", range: "range", sortKey: "sort", sortOrder: "order" };
const query = f => {
	const p = new URLSearchParams(), d = fresh();
	for (const [k, n] of Object.entries(PARAMS)) if (f[k] !== d[k]) p.set(n, f[k]);
	return p.size ? "?" + p : "";
};
const fromQuery = () => {
	const p = new URLSearchParams(location.search), f = {};
	for (const [k, n] of Object.entries(PARAMS)) if (p.has(n)) f[k] = p.get(n);
	if (!SORTS.some(([k]) => k == f.sortKey)) delete f.sortKey;
	if (!/^(asc|desc)$/.test(f.sortOrder)) delete f.sortOrder;
	return f;
};

export const all = section => Object.values(section.items);

export function filter(section, f) {
	const t = f.term.toLowerCase();
	return (section.sorts?.[`${f.sortKey}_${f.sortOrder}`] ?? []).map(k => section.items[k]).filter(it =>
		(!t || it.title.toLowerCase().includes(t)) &&
		(f.genre == "all" || has(it.genre, f.genre)) &&
		(f.director == "all" || has(it.director, f.director)) &&
		(f.seen == "all" || (f.seen == "true") == it.view_count > 0) &&
		(f.resolution == "all" || has(it.resolutions, f.resolution)) &&
		(f.range == "all" || has(it.dynamic_ranges, f.range)));
}

// counts for the filter lists (over the whole section, as the old sidebar did)
export const countTag = (section, field, v) => all(section).filter(it => has(it[field], v)).length;
export const countSeen = (section, seen) => all(section).filter(it => (seen == "true") == it.view_count > 0).length;
export function directors(section, genre) {
	const c = {};
	for (const it of all(section)) if (genre == "all" || has(it.genre, genre)) for (const d of it.director || []) c[d] = (c[d] || 0) + 1;
	return Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// ---- season browser (markup shared by both pages; style via .seasons) ----
export const seasonBrowser = item => `<div class="seasons"><h4>Season Browser</h4><div class="seasons-grid">
	<ul>${item.season_sort_order.map(k => `<li data-do="season" data-v="${k}">${esc(item.seasons[k].title)}</li>`).join("")}</ul>
	<ul data-slot="episodes"></ul><div data-slot="episode"></div></div></div>`;

const seasonActs = app => ({
	season(v, el) {
		const s = app.item.seasons[v], box = el.closest(".seasons");
		pick(el);
		box.querySelector("[data-slot=episodes]").innerHTML = s.episode_sort_order.map(k =>
			`<li data-do="episode" data-v="${v}/${k}">${s.episodes[k].index}. ${esc(s.episodes[k].title)}</li>`).join("");
		box.querySelector("[data-slot=episode]").innerHTML = "";
	},
	episode(v, el) {
		const [sk, ek] = v.split("/"), s = app.item.seasons[sk], e = s.episodes[ek], m = minutes(e.duration);
		pick(el);
		el.closest(".seasons").querySelector("[data-slot=episode]").innerHTML =
			`<h5>${esc(e.title)}</h5><p class="meta">${epTag(s, e)} | ${m} ${plural(m, "minute")} | Rated ${esc(e.rating)}</p><p>${esc(e.summary)}</p>`;
	},
});
const pick = el => { el.parentNode.querySelectorAll(".current").forEach(x => x.classList.remove("current")); el.classList.add("current"); };

// ---- app: state + hash routing + keyboard + click delegation ----
// Elements with data-do="name" data-v="value" call app.acts[name](value, el). Pages add their own acts.
export async function start(render) {
	const res = await fetch("plex-data/data.json");
	const data = await res.json();
	if (data.status != "success" || !data.num_sections) throw new Error("No data");

	const app = {
		data, section: null, f: fresh(), key: null, list: [], acts: {},
		get item() { return this.key && this.section.items[this.key]; },
		go(sec, key, params) {
			const s = data.sections[sec];
			if (s != this.section) { this.section = s; this.f = { ...fresh(), term: this.f.term }; }
			if (params) Object.assign(this.f, params);
			this.key = key && s.items[key] ? +key : null;
			this.refresh();
		},
		set(p) { Object.assign(this.f, p); this.key = null; this.refresh(); },
		sort(k) {
			if (this.f.sortKey == k) this.f.sortOrder = this.f.sortOrder == "asc" ? "desc" : "asc"; else this.f.sortKey = k;
			this.refresh();
		},
		open(k) { this.key = +k; this.refresh(false); },
		close() { this.key = null; this.refresh(false); },
		step(d) { // previous/next item in the current filtered list
			const n = this.list[this.list.findIndex(i => i.key == this.key) + d];
			if (n) this.open(n.key);
		},
		neighbors() {
			const i = this.list.findIndex(x => x.key == this.key);
			return [this.list[i - 1], this.list[i + 1]];
		},
		refresh(relist = true) {
			if (relist) this.list = filter(this.section, this.f);
			history.replaceState(null, "", `${location.pathname}${query(this.f)}#${this.section.key}${this.key ? "/" + this.key : ""}`);
			document.querySelectorAll("a[data-swap]").forEach(a => { a.search = location.search; a.hash = location.hash; });
			render(this);
		},
	};

	app.acts = {
		section: v => app.go(v), sort: v => app.sort(v), genre: v => app.set({ genre: v }), director: v => app.set({ director: v }),
		seen: v => app.set({ seen: v }), res: v => app.set({ resolution: v }), range: v => app.set({ range: v }),
		item: v => app.open(v), close: () => app.close(), step: v => app.step(+v), ...seasonActs(app),
	};
	document.addEventListener("click", e => {
		const el = e.target.closest("[data-do]");
		if (el) app.acts[el.dataset.do]?.(el.dataset.v, el);
	});
	document.addEventListener("keyup", e => {
		if (e.shiftKey || e.metaKey || e.altKey || e.ctrlKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
		if (e.key == "x" && app.key) app.close();
		else if (e.key == "k" && app.key) app.step(-1);
		else if (e.key == "j") app.key ? app.step(1) : app.list[0] && app.open(app.list[0].key);
	});

	const fromHash = params => {
		const m = /^#(\d+)(?:\/(\d+))?/.exec(location.hash);
		app.go(m && data.sections[m[1]] ? m[1] : data.section_display_order[0], m?.[2], params);
	};
	addEventListener("hashchange", () => fromHash());
	fromHash(fromQuery()); // only the first load reads filters from the URL
	return app;
}
