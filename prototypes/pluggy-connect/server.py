"""PROTÓTIPO DESCARTÁVEL (ticket #14): o Pluggy Connect autoriza o conector MeuPluggy (200)?

Servidor local só com a stdlib. Ele guarda o clientSecret (lido do .env.pluggy, fora do repo)
e entrega à página apenas connect tokens. Nada é persistido: o estado vive em memória.

    python -I prototypes/pluggy-connect/server.py [caminho/do/.env.pluggy]

Depois abra http://127.0.0.1:8765
"""

import json
import sys
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENV_PATH = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parents[2] / ".env.pluggy"
API = "https://api.pluggy.ai"
PORT = 8765

env = {}
for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"')

known_items = [i.strip() for i in env.get("PLUGGY_ITEM_IDS", "").split(",") if i.strip()]
session_items = []  # itens criados nesta sessão (em memória)
_api_key = {"value": None, "at": 0}


def pluggy(method, path, body=None):
    if path != "/auth" and (not _api_key["value"] or time.time() - _api_key["at"] > 90 * 60):
        _, a = pluggy("POST", "/auth", {"clientId": env["PLUGGY_CLIENT_ID"], "clientSecret": env["PLUGGY_CLIENT_SECRET"]})
        _api_key.update(value=a["apiKey"], at=time.time())
    headers = {"Content-Type": "application/json"}
    if path != "/auth":
        headers["X-API-KEY"] = _api_key["value"]
    req = urllib.request.Request(API + path, method=method, headers=headers,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"{}")
        except ValueError:
            return e.code, {"raw": raw.decode(errors="replace")[:500]}


def bank_label(item_id):
    """Rótulo grosseiro do banco espelhado: marketingName da conta, sem número nem saldo."""
    st, acc = pluggy("GET", f"/accounts?itemId={item_id}")
    if st != 200:
        return {"accountsStatus": st}
    results = acc.get("results", [])
    names = [a.get("marketingName") for a in results if a.get("marketingName")]
    label = names[0].split(" - ")[0].split(" (")[0] if names else "sem marketingName (BTG?)"
    return {"bank": label, "accounts": [f"{a.get('type')}/{a.get('subtype')}" for a in results]}


def item_summary(item_id, with_accounts=True):
    st, it = pluggy("GET", f"/items/{item_id}")
    if st != 200:
        return {"id": item_id, "httpStatus": st, "body": it}
    out = {k: it.get(k) for k in [
        "id", "status", "executionStatus", "createdAt", "updatedAt", "lastUpdatedAt",
        "consentExpiresAt", "nextAutoSyncAt", "statusDetail", "error", "userAction",
        "parameter", "oauthRedirectUri", "clientUserId"]}
    out["connector"] = f"{(it.get('connector') or {}).get('id')} {(it.get('connector') or {}).get('name')}"
    if with_accounts and it.get("status") == "UPDATED":
        out.update(bank_label(item_id))
    return out


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False, indent=1).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}") if n else {}

    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            data = (HERE / "index.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(data)
        elif self.path == "/api/items":
            ids = known_items + [i for i in session_items if i not in known_items]
            self._json(200, [dict(item_summary(i), origin="sessão" if i in session_items else "env") for i in ids])
        elif self.path.startswith("/api/items/"):
            self._json(200, item_summary(self.path.rsplit("/", 1)[1]))
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        body = self._body()
        if self.path == "/api/connect-token":
            req = {}
            if body.get("itemId"):
                req["itemId"] = body["itemId"]
            opts = {k: body[k] for k in ("avoidDuplicates", "oauthRedirectUri", "clientUserId") if body.get(k)}
            if opts:
                req["options"] = opts
            st, res = pluggy("POST", "/connect_token", req)
            print(f"[token] POST /connect_token {json.dumps(req)} -> {st}", flush=True)
            self._json(st, res)
        elif self.path == "/api/create-item":
            # Variante sem widget: o app cria o item e abre a URL de OAuth no navegador.
            req = {"connectorId": 200, "parameters": {}}
            if body.get("oauthRedirectUri"):
                req["oauthRedirectUri"] = body["oauthRedirectUri"]
            st, res = pluggy("POST", "/items", req)
            print(f"[api] POST /items {json.dumps(req)} -> {st} id={res.get('id')} status={res.get('status')}", flush=True)
            if res.get("id"):
                session_items.append(res["id"])
            self._json(st, res)
        elif self.path == "/api/remember":
            if body.get("itemId") and body["itemId"] not in session_items:
                session_items.append(body["itemId"])
            self._json(200, {"ok": True})
        elif self.path == "/api/log":
            print(f"[page] {json.dumps(body, ensure_ascii=False)}", flush=True)
            self._json(200, {"ok": True})
        else:
            self._json(404, {"error": "not found"})


if __name__ == "__main__":
    print(f"PROTÓTIPO #14 em http://127.0.0.1:{PORT}  (env: {ENV_PATH}, {len(known_items)} itens conhecidos)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
