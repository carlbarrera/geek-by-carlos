#!/bin/bash
# Setup automático de Cloudflare para el panel /admin/ebay
# Requiere: haber corrido "npx wrangler login" antes.
#
# Ejecutar desde la raíz del repo:
#   bash scripts/setup-cloudflare-admin.sh
#
# El script:
#   1. Crea el KV namespace "ebay-pedidos" (producción y preview)
#   2. Muestra los IDs para pegarlos como bindings en el panel Pages
#   3. Configura las 4 variables de entorno (usuarios y contraseñas)

set -e

PROJECT="geek-by-carlos"

echo "════════════════════════════════════════════════════════"
echo "  Setup del panel /admin/ebay en Cloudflare"
echo "════════════════════════════════════════════════════════"
echo ""

# Verificar autenticación
if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "❌ No estás logueado. Ejecuta primero:"
  echo "     npx wrangler login"
  exit 1
fi

echo "✓ Wrangler autenticado"
echo ""

# ─── 1. KV Namespaces ─────────────────────────────────────
echo "1️⃣  Creando KV namespace 'ebay-pedidos'..."
KV_ID=$(npx wrangler kv namespace create "ebay-pedidos" 2>&1 | grep -Eo 'id = "[a-f0-9]{32}"' | head -1 | sed 's/id = "//; s/"//' || echo "")
if [ -z "$KV_ID" ]; then
  # Si ya existe, listarlo
  KV_ID=$(npx wrangler kv namespace list 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
for ns in data:
    if ns.get('title', '').endswith('ebay-pedidos'):
        print(ns['id']); break
" 2>/dev/null || echo "")
fi

if [ -n "$KV_ID" ]; then
  echo "   → ID producción: $KV_ID"
else
  echo "   ⚠️  No se pudo obtener el ID. Créalo manualmente en el panel."
fi

echo ""
echo "2️⃣  Creando KV namespace preview 'ebay-pedidos_preview'..."
KV_PREVIEW_ID=$(npx wrangler kv namespace create "ebay-pedidos" --preview 2>&1 | grep -Eo 'preview_id = "[a-f0-9]{32}"' | head -1 | sed 's/preview_id = "//; s/"//' || echo "")
if [ -n "$KV_PREVIEW_ID" ]; then
  echo "   → ID preview: $KV_PREVIEW_ID"
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo "  ✅ KV namespaces listos"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  Ve a Cloudflare Dashboard → Workers & Pages → $PROJECT"
echo "  → Settings → Functions → KV namespace bindings → Add"
echo ""
echo "    Variable name : PEDIDOS_KV"
echo "    KV namespace  : ebay-pedidos"
echo ""
echo "  Repite para Preview."
echo ""

# ─── 2. Variables de entorno ──────────────────────────────
echo "════════════════════════════════════════════════════════"
echo "  Configurando usuarios y contraseñas"
echo "════════════════════════════════════════════════════════"
echo ""

read -p "Usuario de Carlos [carlos]: " USER_CARLOS
USER_CARLOS=${USER_CARLOS:-carlos}
read -s -p "Contraseña de Carlos: " PASS_CARLOS
echo ""
read -p "Usuario del sobrino [sobrino]: " USER_SOBRINO
USER_SOBRINO=${USER_SOBRINO:-sobrino}
read -s -p "Contraseña del sobrino: " PASS_SOBRINO
echo ""

if [ ${#PASS_CARLOS} -lt 8 ] || [ ${#PASS_SOBRINO} -lt 8 ]; then
  echo "❌ Las contraseñas deben tener al menos 8 caracteres."
  exit 1
fi

echo ""
echo "3️⃣  Guardando secrets en el proyecto Pages..."

for pair in "EBAY_USER_CARLOS:$USER_CARLOS" "EBAY_PASS_CARLOS:$PASS_CARLOS" \
            "EBAY_USER_SOBRINO:$USER_SOBRINO" "EBAY_PASS_SOBRINO:$PASS_SOBRINO"; do
  NAME="${pair%%:*}"
  VALUE="${pair#*:}"
  echo "   → $NAME"
  echo "$VALUE" | npx wrangler pages secret put "$NAME" --project-name="$PROJECT" >/dev/null 2>&1 || {
    echo "     ⚠️  Falló. Ejecuta manualmente:"
    echo "        echo '$VALUE' | npx wrangler pages secret put $NAME --project-name=$PROJECT"
  }
done

echo ""
echo "════════════════════════════════════════════════════════"
echo "  ✅ Todo configurado"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  Ahora:"
echo "  1. Verifica en Cloudflare Dashboard que el binding KV está OK."
echo "  2. Redespliega el sitio (Deployments → Retry deployment)."
echo "  3. Abre https://geekbycarlos.com/admin/ebay/ y prueba con el usuario/clave."
echo ""
