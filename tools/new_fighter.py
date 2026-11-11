"""Makes a new fighter body with Meshy and rigs it on the shared humanoid skeleton.

    MESHY_KEY=... python3 tools/new_fighter.py <id> <prompt file> <out dir>

Steps, each resumable (task ids are saved in <out dir>/<id>.json, so re-running never pays twice):
  1. preview  text -> untextured body, A-pose, about 30,000 triangles
  2. refine   paints the textures (with metal, roughness and normal maps)
  3. rig      standard humanoid skeleton: Hips, Spine, ..., the same 24 bones as every other fighter

The result is <out dir>/<id>_rig.glb. Because the skeleton is shared, the new fighter uses the whole
motion library (assets/models/anims.glb) at no extra cost. Weapons and shields are NOT part of the
body: the game attaches them to the hand and forearm bones, so the prompt must ask for empty hands.

The key is read from the environment and never written anywhere.
"""
import json, os, sys, time, urllib.request, urllib.error

KEY = os.environ["MESHY_KEY"]
API = "https://api.meshy.ai/openapi"
MODEL = os.environ.get("MESHY_MODEL", "latest")
# Refuse to pay more than this for the shape step; the task is cancelled for a refund if it would.
MAX_PREVIEW = int(os.environ.get("MESHY_MAX_PREVIEW", "30"))


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        sys.exit(f"Meshy {method} {path} -> {e.code}: {e.read().decode()[:300]}")


def wait(path, tid, label):
    last = -1
    while True:
        t = call("GET", f"{path}/{tid}")
        if t.get("progress", 0) != last:
            last = t.get("progress", 0)
            print(f"  {label}: {t['status']} {last}%", flush=True)
        if t["status"] in ("SUCCEEDED", "FAILED", "CANCELED", "EXPIRED"):
            return t
        time.sleep(10)


def main(fid, prompt, out):
    os.makedirs(out, exist_ok=True)
    rec_path = os.path.join(out, fid + ".json")
    rec = json.load(open(rec_path)) if os.path.exists(rec_path) else {}
    save = lambda: json.dump(rec, open(rec_path, "w"), indent=1)
    print("credits before:", call("GET", "/v1/balance").get("balance"), flush=True)

    if not rec.get("preview"):
        rec["preview"] = call("POST", "/v2/text-to-3d", {
            "mode": "preview", "prompt": prompt[:800], "ai_model": MODEL, "pose_mode": "a-pose",
            "should_remesh": True, "topology": "triangle", "target_polycount": 30000, "target_formats": ["glb"]})["result"]
        save()
        cost = call("GET", f"/v2/text-to-3d/{rec['preview']}").get("consumed_credits", 0)
        print("preview cost:", cost, flush=True)
        if cost > MAX_PREVIEW:
            call("DELETE", f"/v2/text-to-3d/{rec['preview']}")
            del rec["preview"]; save()
            sys.exit(f"preview would cost {cost} credits (limit {MAX_PREVIEW}); cancelled")
    t = wait("/v2/text-to-3d", rec["preview"], "preview")
    if t["status"] != "SUCCEEDED": sys.exit(f"preview {t['status']}: {t.get('task_error')}")

    if not rec.get("refine"):
        rec["refine"] = call("POST", "/v2/text-to-3d", {
            "mode": "refine", "preview_task_id": rec["preview"], "enable_pbr": True, "texture_prompt": prompt[:800], "target_formats": ["glb"]})["result"]
        save()
    r = wait("/v2/text-to-3d", rec["refine"], "refine")
    if r["status"] != "SUCCEEDED": sys.exit(f"refine {r['status']}: {r.get('task_error')}")
    print("refine cost:", r.get("consumed_credits"), flush=True)

    if not rec.get("rig"):
        rec["rig"] = call("POST", "/v1/rigging", {"model_url": r["model_urls"]["glb"], "height_meters": 1.75})["result"]
        save()
    g = wait("/v1/rigging", rec["rig"], "rig")
    if g["status"] != "SUCCEEDED": sys.exit(f"rig {g['status']}: {g.get('task_error')}")
    print("rig cost:", g.get("consumed_credits"), flush=True)

    urllib.request.urlretrieve(g["result"]["rigged_character_glb_url"], os.path.join(out, fid + "_rig.glb"))
    urllib.request.urlretrieve(r["thumbnail_url"], os.path.join(out, fid + "_thumb.png"))
    print("credits after:", call("GET", "/v1/balance").get("balance"), flush=True)
    print(fid, "done ->", os.path.join(out, fid + "_rig.glb"), flush=True)


if __name__ == "__main__":
    main(sys.argv[1], open(sys.argv[2]).read().strip(), sys.argv[3])
