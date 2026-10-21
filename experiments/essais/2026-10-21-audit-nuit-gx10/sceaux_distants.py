import hashlib, json, os, sys
root = "/home/nvidia/tvlens-setup"
def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()
out = []
for dirpath, dirs, files in os.walk(root):
    dirs[:] = [d for d in dirs if d not in ("node_modules", ".git", "modeles-ollama")]
    if "integrite.json" not in files:
        continue
    seal = os.path.join(dirpath, "integrite.json")
    try:
        data = json.load(open(seal))
    except Exception as e:
        out.append({"seal": seal, "error": repr(e)}); continue
    listed = data.get("files", {})
    if isinstance(listed, list):
        listed = {x.get("path"): x.get("sha256") for x in listed}
    bad, missing = [], []
    for rel, digest in listed.items():
        p = os.path.join(dirpath, rel)
        if not os.path.exists(p):
            missing.append(rel); continue
        if isinstance(digest, dict):
            digest = digest.get("sha256")
        if digest and sha(p) != digest.replace("sha256:", ""):
            bad.append(rel)
    present = set()
    for dp, _, fs in os.walk(dirpath):
        for f in fs:
            present.add(os.path.relpath(os.path.join(dp, f), dirpath))
    extra = sorted(present - set(listed) - {"integrite.json"})
    out.append({"seal": os.path.relpath(seal, root), "sealSha256": sha(seal), "listed": len(listed),
                "mismatch": bad[:5], "nMismatch": len(bad), "missing": missing[:5], "nMissing": len(missing),
                "extraUnsealed": extra[:5], "nExtra": len(extra)})
print(json.dumps(out, indent=1))
