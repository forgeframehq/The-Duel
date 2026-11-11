"""Makes a new fighter body with Meshy and rigs it on the shared humanoid skeleton.

    MESHY_KEY=... python3 tools/new_fighter.py <id> <prompt .txt  OR  concept image .png/.jpg/.webp> <out dir>

A concept image gives far more control over the look than a text prompt. It should show one character,
full body, front view, A-pose, empty hands, plain background.

Steps, each resumable (task ids are saved in <out dir>/<id>.json, so re-running never pays twice):
  1. preview  text -> untextured body, A-pose, about 30,000 triangles
  2. refine   paints the textures (with metal, roughness and normal maps)
  3. rig      standard humanoid skeleton: Hips, Spine, ..., the same 24 bones as every other fighter

The result is <out dir>/<id>_rig.glb. Because the skeleton is shared, the new fighter uses the whole
motion library (assets/models/anims.glb) at no extra cost. Weapons and shields are NOT part of the
body: the game attaches them to the hand and forearm bones, so the prompt must ask for empty hands.

The key is read from the environment and never written anywhere.
"""
import base64, json, os, sys, time, urllib.request, urllib.error

KEY = os.environ["MESHY_KEY"]
API = "https://api.meshy.ai/openapi"
MODEL = os.environ.get("MESHY_MODEL", "latest")
# Refuse to pay more than this for the shape step; the task is cancelled for a refund if it would.
MAX_PREVIEW = int(os.environ.get("MESHY_MAX_PREVIEW", "30"))
# How many triangles to ask for. 30,000 was the old phone-first setting; fighters made from build 19 on use far more.
POLY = int(os.environ.get("MESHY_POLY", "30000"))


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


def from_image(fid, image, out, rec, save):
    """Image -> textured body (A-pose, about 30,000 triangles). Returns the finished task."""
    if not rec.get("model"):
        ext = os.path.splitext(image)[1].lower().lstrip(".").replace("jpg", "jpeg")
        uri = f"data:image/{ext};base64," + base64.b64encode(open(image, "rb").read()).decode()
        rec["model"] = call("POST", "/v1/image-to-3d", {
            "image_url": uri, "ai_model": MODEL, "should_texture": True, "enable_pbr": True, "pose_mode": "a-pose",
            "should_remesh": True, "topology": "triangle", "target_polycount": POLY, "target_formats": ["glb"]})["result"]
        save()
        cost = call("GET", f"/v1/image-to-3d/{rec['model']}").get("consumed_credits", 0)
        print("image-to-3d cost:", cost, flush=True)
        if cost > MAX_PREVIEW + 20:
            call("DELETE", f"/v1/image-to-3d/{rec['model']}")
            del rec["model"]; save()
            sys.exit(f"image-to-3d would cost {cost} credits (limit {MAX_PREVIEW + 20}); cancelled")
    t = wait("/v1/image-to-3d", rec["model"], "model")
    if t["status"] != "SUCCEEDED": sys.exit(f"model {t['status']}: {t.get('task_error')}")
    return t


def main(fid, source, out):
    os.makedirs(out, exist_ok=True)
    rec_path = os.path.join(out, fid + ".json")
    rec = json.load(open(rec_path)) if os.path.exists(rec_path) else {}
    save = lambda: json.dump(rec, open(rec_path, "w"), indent=1)
    print("credits before:", call("GET", "/v1/balance").get("balance"), flush=True)
    if not source.lower().endswith(".txt"):
        r = from_image(fid, source, out, rec, save)
        return finish(fid, out, rec, save, r)
    prompt = open(source).read().strip()

    if not rec.get("preview"):
        rec["preview"] = call("POST", "/v2/text-to-3d", {
            "mode": "preview", "prompt": prompt[:800], "ai_model": MODEL, "pose_mode": "a-pose",
            "should_remesh": True, "topology": "triangle", "target_polycount": POLY, "target_formats": ["glb"]})["result"]
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
    finish(fid, out, rec, save, r)


def finish(fid, out, rec, save, r):
    """Rig the textured body on the shared humanoid skeleton and download it."""
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
    main(sys.argv[1], sys.argv[2], sys.argv[3])
