import json
import urllib.error
import urllib.request


class ApiError(RuntimeError):
    def __init__(self, message, status=0):
        super().__init__(message)
        self.status = status


class ApiClient:
    def __init__(self, base_url, version):
        self.base_url = base_url.rstrip("/")
        self.version = version

    def request(self, method, path, payload=None, access_token=""):
        data = None
        headers = {
            "Accept": "application/json",
            "User-Agent": f"EGDeliveryPrintAgent/{self.version}",
            "X-Agent-Version": self.version,
        }
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=data,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=35) as response:
                raw = response.read()
                return json.loads(raw.decode("utf-8")) if raw else {}
        except urllib.error.HTTPError as exc:
            try:
                body = json.loads(exc.read().decode("utf-8"))
                message = body.get("detail") or f"Falha no servidor ({exc.code})"
            except Exception:
                message = f"Falha no servidor ({exc.code})"
            raise ApiError(message, exc.code) from exc
        except urllib.error.URLError as exc:
            reason = getattr(exc, "reason", exc)
            raise ApiError(f"Sem conexao com o EG Delivery: {reason}") from exc

    def pair(self, payload):
        return self.request("POST", "/print-agent/pair", payload)

    def heartbeat(self, access_token, printer_name):
        return self.request(
            "POST",
            "/print-agent/heartbeat",
            {"app_version": self.version, "printer_name": printer_name},
            access_token,
        )

    def claim(self, access_token):
        return self.request("POST", "/print-agent/jobs/claim", {}, access_token)

    def complete(self, access_token, job_id):
        return self.request("POST", f"/print-agent/jobs/{job_id}/complete", {}, access_token)

    def fail(self, access_token, job_id, error):
        return self.request(
            "POST",
            f"/print-agent/jobs/{job_id}/fail",
            {"error": str(error)[:1000]},
            access_token,
        )

