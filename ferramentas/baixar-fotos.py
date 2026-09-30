"""
magusCar — download de fotos de carros populares brasileiros.

Busca no Wikimedia Commons pela API de pesquisa, escolhe o melhor candidato
(horizontais, razoavelmente grandes, sem SVG/PNG com fundo transparente)
e salva em images/ já redimensionado para web.

Uso:  python ferramentas/baixar-fotos.py
"""

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from io import BytesIO

from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(BASE, "images")
os.makedirs(IMAGES_DIR, exist_ok=True)

UA = "magusCar-portfolio/1.0 (educational portfolio project)"

# slug de saída -> (termo de busca, palavra-chave obrigatória no título)
BUSCAS = {
    "veiculo-01-gol": ("Volkswagen Gol Brazil", "gol"),
    "veiculo-02-up": ("Volkswagen Up! Brazil", "up"),
    "veiculo-03-uno": ("Fiat Uno Brazil", "uno"),
    "veiculo-04-classic": ("Chevrolet Classic Brazil", "classic"),
    "veiculo-05-mobi": ("Fiat Mobi Brazil", "mobi"),
    "veiculo-06-onix": ("Chevrolet Onix Brazil", "onix"),
    "veiculo-07-strada": ("Fiat Strada Brazil", "strada"),
    "veiculo-08-kwid": ("Renault Kwid", "kwid"),
    "veiculo-09-argo": ("Fiat Argo Brazil", "argo"),
    "veiculo-10-hb20": ("Hyundai HB20 Brazil", "hb20"),
    "veiculo-11-saveiro": ("Volkswagen Saveiro Brazil", "saveiro"),
    "veiculo-12-polo": ("Volkswagen Polo Brazil", "polo"),
    "veiculo-13-sandero": ("Renault Sandero Brazil", "sandero"),
    "veiculo-14-c3": ("Citroen C3 Brazil", "c3"),
    "veiculo-15-fit": ("Honda Fit Brazil", "fit"),
    "veiculo-16-etios": ("Toyota Etios", "etios"),
    "veiculo-17-palio": ("Fiat Palio", "palio"),
    "veiculo-18-corsa": ("Chevrolet Corsa Classic", "corsa"),
    "veiculo-19-voyage": ("Chevrolet Voyage Brasil", "voyage"),
    "veiculo-20-spin": ("Chevrolet Spin Maringa", "spin"),
    "veiculo-21-cronos": ("Fiat Cronos", "cronos"),
    "veiculo-22-tracker": ("Chevrolet Tracker", "tracker"),
    "veiculo-23-tcross": ("Volkswagen T-Cross", "cross"),
    "veiculo-24-compact": ("Chevrolet Compact Chile", "compact"),
    "loja-fachada": ("car dealership showroom", "dealership|showroom"),
    "loja-bancada": ("car workshop mechanic", "workshop|garage|mechanic"),
    "loja-estacionamento": ("car dealership lot cars for sale", "lot|dealership|garage"),
}

API = "https://commons.wikimedia.org/w/api.php"

IGNORAR = re.compile(
    r"(logo|badge|emblem|steering|engine|interior|seat|wheel|rim|"
    r"dashboard|cluster|gearbox|drawing|diagram|blueprint|map|"
    r"cockpit|grille|ellis|spin \d|spinning|dancing)",
    re.I,
)


def get_json(params, tentativas=5):
    """Chamada à API do Commons com espera exponencial em caso de rate limit."""
    params = dict(params, format="json")
    url = f"{API}?{urllib.parse.urlencode(params)}"
    for tentativa in range(tentativas):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=40) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 503) or tentativa == tentativas - 1:
                raise
            espera = 8 * (tentativa + 1)
            print(f"    rate limit ({exc.code}), aguardando {espera}s")
            time.sleep(espera)
    raise RuntimeError("sem resposta da API")


def candidates(termo, obrigatorio):
    """Busca no Commons e devolve candidatos com a palavra-chave no título."""
    data = get_json(
        {
            "action": "query",
            "generator": "search",
            "gsrsearch": f"filetype:bitmap {termo}",
            "gsrnamespace": 6,
            "gsrlimit": 40,
            "prop": "imageinfo",
            "iiprop": "url|size",
            "iiurlwidth": 1600,
        }
    )
    pages = data.get("query", {}).get("pages", {})
    padrao = re.compile(obrigatorio, re.I)
    out = []
    for page in pages.values():
        info = (page.get("imageinfo") or [{}])[0]
        title = page.get("title", "")
        if not info.get("thumburl"):
            continue
        if IGNORAR.search(title) or not padrao.search(title):
            continue
        w, h = info.get("width", 0), info.get("height", 0)
        if w < 700 or h < 450:
            continue
        ratio = w / h if h else 0
        if not 1.15 <= ratio <= 2.4:
            continue
        out.append((title, info["thumburl"], w, h))
    out.sort(key=lambda t: t[2] * t[3], reverse=True)
    return out


def salvar(url, destino, max_w=1280, max_h=800):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as resp:
        dados = resp.read()
    img = Image.open(BytesIO(dados))
    if img.mode != "RGB":
        img = img.convert("RGB")
    if img.width < 640 or img.height < 420:
        raise ValueError("imagem pequena demais")
    img.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
    img.save(destino, "JPEG", quality=86, optimize=True, progressive=True)
    return img.size


def main():
    faltando = {k: v for k, v in BUSCAS.items() if not os.path.exists(os.path.join(IMAGES_DIR, f"{k}.jpg"))}
    print(f"{len(BUSCAS) - len(faltando)} ja existem, {len(faltando)} para baixar\n")

    for slug, (termo, obrigatorio) in faltando.items():
        destino = os.path.join(IMAGES_DIR, f"{slug}.jpg")
        print(f"[{slug}] buscando: {termo}")
        try:
            lista = candidates(termo, obrigatorio)
        except Exception as exc:  # noqa: BLE001
            print(f"    ERRO na busca: {exc}")
            continue

        if not lista:
            print("    nenhum candidato aprovado")
            continue

        for titulo, url, w, h in lista[:6]:
            try:
                tamanho = salvar(url, destino)
                print(f"    OK <- {titulo}  ({w}x{h} -> {tamanho[0]}x{tamanho[1]})")
                break
            except Exception as exc:  # noqa: BLE001
                print(f"    falhou: {titulo} -> {exc}")
                time.sleep(1)
        else:
            print("    ERRO: nenhum candidato baixou")
        time.sleep(2)

    print("\n--- images/ ---")
    for nome in sorted(os.listdir(IMAGES_DIR)):
        if nome.lower().endswith(".jpg"):
            kb = os.path.getsize(os.path.join(IMAGES_DIR, nome)) / 1024
            print(f"  {nome:<26} {kb:7.0f} KB")


if __name__ == "__main__":
    main()
