"""Makes a piece of scenery with Meshy: text -> textured model. No skeleton.

    MESHY_KEY=... python3 tools/new_prop.py <id> <prompt .txt> <out dir> [triangles]

Resumable like new_fighter.py: task ids are saved in <out dir>/<id>.json so a re-run never pays twice.
The result is <out dir>/<id>.glb. Scenery pieces share one art style by sharing the STYLE line below,
and are arranged into arenas by the game's code, so a small kit builds many places.
"""
import json, os, sys, urllib.request
from new_fighter import call, wait, MODEL

STYLE = " Weathered medieval castle ruin, rough grey-brown stone blocks with moss and wear, realistic, highly detailed game environment asset, single isolated object, no ground plane, no background."


def main(pid, prompt, out, tris):
    os.makedirs(out, exist_ok=True)
    rec_path = os.path.join(out, pid + ".json")
    rec = json.load(open(rec_path)) if os.path.exists(rec_path) else {}
    save = lambda: json.dump(rec, open(rec_path, "w"), indent=1)
    if not rec.get("preview"):
        rec["preview"] = call("POST", "/v2/text-to-3d", {"mode": "preview", "prompt": (prompt + STYLE)[:800], "ai_model": MODEL,
                              "should_remesh": True, "topology": "triangle", "target_polycount": tris, "target_formats": ["glb"]})["result"]
        save()
    t = wait("/v2/text-to-3d", rec["preview"], pid + " preview")
    if t["status"] != "SUCCEEDED": sys.exit(f"{pid}: preview {t['status']}: {t.get('task_error')}")
    if not rec.get("refine"):
        rec["refine"] = call("POST", "/v2/text-to-3d", {"mode": "refine", "preview_task_id": rec["preview"], "enable_pbr": True,
                             "texture_prompt": (prompt + STYLE)[:800], "target_formats": ["glb"]})["result"]
        save()
    r = wait("/v2/text-to-3d", rec["refine"], pid + " refine")
    if r["status"] != "SUCCEEDED": sys.exit(f"{pid}: refine {r['status']}: {r.get('task_error')}")
    urllib.request.urlretrieve(r["model_urls"]["glb"], os.path.join(out, pid + ".glb"))
    print(pid, "done, cost", (t.get("consumed_credits") or 0) + (r.get("consumed_credits") or 0), "| credits left:", call("GET", "/v1/balance").get("balance"), flush=True)


if __name__ == "__main__":
    main(sys.argv[1], open(sys.argv[2]).read().strip(), sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 12000)
