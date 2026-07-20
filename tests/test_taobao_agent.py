import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "taobao_agent.py"
spec = importlib.util.spec_from_file_location("taobao_agent", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)


class TaobaoAgentTests(unittest.TestCase):
    def test_safe_name_removes_unsafe_characters(self):
        self.assertEqual(module.safe_name("../商品 A/B"), "A_B")

    def test_safe_name_has_fallback(self):
        self.assertEqual(module.safe_name("***"), "image")

    def test_file_sha256_is_stable(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sample.txt"
            path.write_bytes(b"abc")
            self.assertEqual(
                module.file_sha256(path),
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            )

    def test_extension_manifest_is_v3_and_scoped(self):
        manifest = json.loads((ROOT / "assets" / "chrome-extension" / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["manifest_version"], 3)
        permissions = set(manifest["permissions"])
        self.assertNotIn("cookies", permissions)
        self.assertNotIn("history", permissions)
        self.assertNotIn("webRequest", permissions)
        hosts = " ".join(manifest["host_permissions"])
        self.assertIn("taobao.com", hosts)
        self.assertIn("tmall.com", hosts)


if __name__ == "__main__":
    unittest.main()
