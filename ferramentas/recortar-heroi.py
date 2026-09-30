"""
magusCar — recorte da foto de destaque do hero (Polo preto, fundo removido).

Baixa a imagem em resolucao maxima no Wikimedia Commons, remove o fundo com
u2net (rembg), limpa a alfa, apara e salva como PNG transparente.

Uso:  python ferramentas/recortar-heroi.py
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request
from io import BytesIO

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(BASE, "images")
os.makedirs(IMAGES_DIR, exist_ok=True)

DESTINO = os.path.join(IMAGES_DIR, "hero-polo-preto.png")
CACHE = os.path.join(BASE, ".cache-hero")
os.makedirs(CACHE, exist_ok=True)

API = "https://commons.wikimedia.org/w/api.php"
UA = "magusCar-portfolio/1.0 (educational portfolio project)"

ARQUIVO_FONTE = "File:Volkswagen Polo VI GTI (2021) 1X7A0343.jpg"
LARGURA_MAX = 1500


def api(params, tentativas=5):
    params = dict(params, format="json")
    url = API + "?" + urllib.parse.urlencode(params)
    for t in range(tentativas):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception:
            if t == tentativas - 1:
                raise
            print("  nova tentativa em %ds..." % (10 * (t + 1)))
            time.sleep(10 * (t + 1))


def baixar_original():
    cache = os.path.join(CACHE, "origem.jpg")
    if os.path.exists(cache):
        return cache

    dados = api({
        "action": "query",
        "titles": ARQUIVO_FONTE,
        "prop": "imageinfo",
        "iiprop": "url|size|extmetadata",
    })
    page = list(dados["query"]["pages"].values())[0]
    info = page["imageinfo"][0]
    print("fonte: %s (%dx%d)" % (ARQUIVO_FONTE, info["width"], info["height"]))

    req = urllib.request.Request(info["url"], headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as resp:
        raw = resp.read()
    with open(cache, "wb") as fh:
        fh.write(raw)
    return cache


def limpar_alfa(rgba):
    """Mantem so o componente principal e suaviza a borda."""
    arr = np.asarray(rgba).astype(np.uint8)
    a = arr[:, :, 3]

    solido = a > 128
    rot, n = ndi.label(solido)
    if n > 1:
        tam = ndi.sum(solido, rot, range(1, n + 1))
        maior = tam.argmax() + 1
        # mantem o blob principal e descarta apenas os cacos soltos
        for idx, tam_i in enumerate(tam, start=1):
            if idx != maior and tam_i < tam.max() * 0.05:
                solido &= (rot != idx)

    # reconstitui a alfa: dilata um pouco a regiao solida para nao comer a borda
    a2 = np.zeros_like(a)
    a2[solido] = 255
    a2 = ndi.grey_dilation(a2, size=3)
    difusao = ndi.gaussian_filter(a2.astype(np.float32) / 255.0, sigma=0.7)
    alfa = np.clip(difusao * 1.06, 0, 1)

    arr[:, :, 3] = (alfa * 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def aparar(img, margem=14):
    a = np.asarray(img)[:, :, 3]
    ys, xs = np.where(a > 8)
    x0, y0 = xs.min(), ys.min()
    x1, y1 = xs.max(), ys.max()

    x0 = max(0, x0 - margem)
    y0 = max(0, y0 - margem)
    x1 = min(img.width - 1, x1 + margem)
    y1 = min(img.height - 1, y1 + margem)
    return img.crop((x0, y0, x1 + 1, y1 + 1))


def main():
    from rembg import new_session, remove

    caminho = baixar_original()
    origem = Image.open(caminho).convert("RGB")

    print("removendo fundo (u2net)...", flush=True)
    sessao = new_session("u2net")
    recortado = remove(origem, session=sessao, alpha_matting=True,
                       alpha_matting_foreground_threshold=250,
                       alpha_matting_background_threshold=15,
                       alpha_matting_erode_size=6).convert("RGBA")

    recortado = limpar_alfa(recortado)
    recortado = aparar(recortado)

    if recortado.width > LARGURA_MAX:
        nova = LARGURA_MAX
        altura = round(recortado.height * nova / recortado.width)
        recortado = recortado.resize((nova, altura), Image.Resampling.LANCZOS)

    recortado.save(DESTINO, "PNG", optimize=True)

    alfa = np.asarray(recortado)[:, :, 3]
    print("\nsalvo: %s" % os.path.relpath(DESTINO, BASE))
    print("  dimensoes: %dx%d" % recortado.size)
    print("  cobertura opaca: %.1f%%" % ((alfa > 200).mean() * 100))
    print("  tamanho: %.0f KB" % (os.path.getsize(DESTINO) / 1024))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
