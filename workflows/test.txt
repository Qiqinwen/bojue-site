#!/usr/bin/env node
"use strict";
/*
 * Sync new Manbo works (radio dramas + records) into works.json.
 * - Reads the user's public Manbo H5 profile API.
 * - Adds only NEW items (by id) to the dramas / records arrays.
 * - Downloads cover images for new items into images/works/.
 * - Never touches profile info, favorites, group, or existing items.
 * Exit 0 always when the fetch succeeds; prints a JSON summary.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const UID = process.env.MANBO_UID || "3684994445375";
const ROOT = process.env.REPO_ROOT || process.cwd();
const API = "https://manbo.kilaaudio.com/Tg/personalH5?uid=" + UID;
const WORKS_PATH = path.join(ROOT, "works.json");
const IMG_DIR = path.join(ROOT, "images", "works");
const PLAY_BASE = "https://manbo.hongdoulive.com/Activecard/radioplay?id=";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function get(url, headers, redirects) {
  redirects = redirects || 0;
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects >= 5) return reject(new Error("too many redirects: " + url));
        return resolve(get(res.headers.location, headers, redirects + 1));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(25000, () => req.destroy(new Error("timeout: " + url)));
  });
}

function resize(url, size) {
  return url + "?x-oss-process=image/resize,m_mfit,h_" + size + ",w_" + size + ",limit_0/crop,w_" + size + ",h_" + size + ",g_center";
}

function tags(resp) {
  return (resp.categoryLabels || []).map((l) => l.name).slice(0, 4);
}

function toItem(it, prefix) {
  const r = it.radioDramaResp;
  const id = r.radioDramaIdStr;
  const file = path.join(IMG_DIR, prefix + "-" + id + ".jpg");
  return {
    id,
    title: r.title,
    cover: "images/works/" + prefix + "-" + id + ".jpg",
    srcCover: resize(r.coverPic, 400),
    tags: tags(r),
    studio: r.ownerResp ? r.ownerResp.nickname : "",
    playUrl: PLAY_BASE + id,
    _file: file,
    _src: resize(r.coverPic, 400)
  };
}

async function download(file, url) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const r = await get(url, {
    "User-Agent": UA,
    "Referer": "https://manbo.kilaaudio.com/"
  });
  if (r.status !== 200 || r.body.length < 500) {
    throw new Error("cover download failed (" + r.status + ", " + r.body.length + "b): " + url);
  }
  fs.writeFileSync(file, r.body);
}

async function main() {
  if (!fs.existsSync(WORKS_PATH)) throw new Error("works.json not found at " + WORKS_PATH);
  const works = JSON.parse(fs.readFileSync(WORKS_PATH, "utf8"));

  const res = await get(API, {
    "User-Agent": UA,
    "Referer": "https://manbo.kilaaudio.com/",
    "Connection": "close"
  });
  if (res.status !== 200) throw new Error("Manbo API status " + res.status);

  const data = JSON.parse(res.body.toString("utf8")).data || {};
  const uw = data.userWorkResp || {};
  const incomingDramas = ((uw.radioDramaWorks && uw.radioDramaWorks.radioDramas) || []).map((it) => toItem(it, "d"));
  const incomingRecords = ((uw.recordWorks && uw.recordWorks.records) || []).map((it) => toItem(it, "r"));

  let added = 0;
  const dlJobs = [];
  function merge(key, incoming) {
    const existing = works[key] || [];
    const have = new Set(existing.map((i) => i.id));
    const fresh = incoming.filter((i) => !have.has(i.id));
    if (fresh.length) {
      works[key] = existing.concat(fresh);
      added += fresh.length;
      fresh.forEach((i) => {
        if (!fs.existsSync(i._file)) dlJobs.push(i);
      });
    }
  }
  merge("dramas", incomingDramas);
  merge("records", incomingRecords);

  for (const job of dlJobs) {
    await download(job._file, job._src);
  }

  // strip internal helper fields before saving
  ["dramas", "records"].forEach((key) => {
    (works[key] || []).forEach((i) => { delete i._file; delete i._src; });
  });

  fs.writeFileSync(WORKS_PATH, JSON.stringify(works, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ ok: true, added, dramas: works.dramas.length, records: works.records.length, coversDownloaded: dlJobs.length }));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
